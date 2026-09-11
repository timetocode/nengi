# Network-condition simulation

Use Nengi's simulated transports to run the real handshake, command, request,
Ping/Pong, snapshot, and frame paths under reproducible delay. Prefer these
transports over replacing socket methods or delaying decoded game objects.

The built-in model supports separate client-to-server and server-to-client
latency, seeded uniform jitter, and periodic stalls. It preserves WebSocket
message order independently in each direction. A later payload can therefore
be held behind an earlier delayed payload, matching TCP/WebSocket
head-of-line behavior.

The simulator does not currently model packet loss, duplication, message
reordering, bandwidth limits, socket backpressure, server tick stalls, or
client frame stalls. Test CPU and event-loop stalls separately. WebSocket does
not expose unordered or duplicated messages to Nengi, so those behaviors
should not be mixed into the default WebSocket model.

## Conditions

Define one seeded profile for the duplex link:

```ts
const conditions = {
    seed: 481516,
    clientToServer: {
        latencyMs: 55,
        jitterMs: 12
    },
    serverToClient: {
        latencyMs: 90,
        jitterMs: 25,
        burst: {
            everyMs: 4000,
            durationMs: 350,
            offsetMs: 1000
        }
    }
}
```

`jitterMs` samples uniformly from `-jitterMs` through `+jitterMs`, then clamps
the total sampled delay to zero or greater. The seed creates independent,
repeatable random streams for the two directions.

A burst describes a periodic stall window relative to creation or the most
recent `configure` call. Payloads whose candidate release time lands inside
the window are held until its end. FIFO enforcement can hold later payloads at
the same boundary.

## Manually advanced local tests

Use the simulated local adapters from the `nengi` package root. Give the
`Instance`, `Client`, and link the same manual monotonic clock:

```ts
import {
    Client,
    Instance,
    SimulatedLocalClientAdapter,
    SimulatedLocalInstanceAdapter
} from 'nengi'
import { dataViewBinary } from 'nengi-dataviews'

let nowMs = 0
const now = () => nowMs
const instance = new Instance(context, { now })
const instanceAdapter = new SimulatedLocalInstanceAdapter(instance.network, {
    binary: dataViewBinary
})
const socket = instanceAdapter.createSimulatedConnect({
    now,
    conditions
})
const client = new Client(
    context,
    SimulatedLocalClientAdapter,
    20,
    { binary: dataViewBinary },
    { now }
)

const connecting = client.connect(socket.clientSocket, { role: 'test' })

nowMs += 100
socket.advance()
await Promise.resolve()

nowMs += 100
socket.advance()
await connecting
```

`socket.advance()` delivers everything due at the current injected time.
`socket.advanceTo(timeMs)` advances the link to an explicit monotonic value;
the value cannot move backward. Advancing the link does not advance the clock
function, the game simulation, `instance.step()`, or `client.flush()`.

An asynchronous `instance.onConnect` may need a microtask turn after the
client-to-server handshake is delivered before the handshake response is
queued. Advance the response direction only after that work has settled.

For a deterministic scenario, make order visible in the test:

1. Set the shared clock.
2. Advance due network deliveries.
3. Drain server events and apply authoritative transitions.
4. Explicitly confirm completed command batches and call `instance.step()` when
   a server network tick is due.
5. Advance newly due deliveries.
6. Drain client frames, produce commands or requests, and call `client.flush()`.
7. Advance newly due deliveries again when the tested timestamp permits it.

Do not await a delayed connect before advancing both handshake directions.

Use ordinary `LocalInstanceAdapter` and `LocalClientAdapter` when delay is not
part of the assertion. Their immediate path has no scheduler or timer work.

## Live browser use

Use the dedicated browser adapter when a running client needs reproducible
conditions:

```ts
import { Client } from 'nengi'
import { SimulatedWebSocketClientAdapter } from 'nengi-websocket-client-adapter'

const client = new Client(context, SimulatedWebSocketClientAdapter, 20, {
    conditions
})

await client.connect('ws://localhost:8079')
```

## Live Node use

Bots and command-line clients use the corresponding `ws` adapter:

```ts
import { Client } from 'nengi'
import { SimulatedWsClientAdapter } from 'nengi-ws-client-adapter'

const client = new Client(context, SimulatedWsClientAdapter, 20, {
    conditions
})

await client.connect('ws://localhost:8079', { role: 'bot' })
```

Live adapters use monotonic time and one timer per duplex link. They condition
the connection handshake and all later Nengi payloads. Closing or disconnecting
the socket clears queued deliveries.

## Reconfiguration and diagnostics

Change a live profile through the adapter:

```ts
client.adapter.configureNetworkConditions(nextConditions)

const status = client.adapter.getNetworkConditionStatus()
console.log(status.clientToServer.queued)
console.log(status.serverToClient.sampledDelayMs)
console.log(status.serverToClient.effectiveDelayMs)
console.log(status.serverToClient.state)
```

`sampledDelayMs` is the delay returned by the selected model.
`effectiveDelayMs` includes any additional FIFO hold behind an earlier payload.

`configureNetworkConditions` changes only payloads enqueued afterward. It does
not reschedule traffic already in flight. It restarts the seeded streams and
burst timeline for future payloads.

The local socket exposes the same link as `socket.conditions`, including
`configure`, `status`, and `clear`. `clear` discards queued traffic and cancels
the active timer; it does not close either endpoint by itself.

## Custom deterministic delay models

Use a custom `NetworkDelayModel` when a deterministic trace or state machine
cannot be expressed as latency, jitter, and periodic stalls:

```ts
import type { NetworkDelayModel } from 'nengi'

class RecordedDelay implements NetworkDelayModel {
    private index = 0

    constructor(private readonly delaysMs: readonly number[]) {}

    reset() {
        this.index = 0
    }

    sample() {
        const delayMs = this.delaysMs[this.index % this.delaysMs.length]
        this.index++
        return { delayMs, state: 'recorded' }
    }
}

const tracedConditions = {
    seed: 7,
    clientToServer: { model: new RecordedDelay([40, 80, 40]) },
    serverToClient: { model: new RecordedDelay([90, 140, 90]) }
}
```

Create a separate stateful model instance for each direction. `sample` receives
the direction, enqueue sequence, enqueue time, elapsed profile time, payload
byte length, and a seeded random function. It must return a finite,
non-negative `delayMs`; the link still enforces FIFO ordering and payload
copying.

Keep custom models deterministic and computationally small. The delay model
decides when a payload may be delivered; it must not decode, mutate, drop,
duplicate, or deliver the payload itself.
