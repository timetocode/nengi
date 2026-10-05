# Server network limits

Every `Instance` has finite connection, incoming-traffic, and queue budgets.
These defaults are enabled without extra setup. They protect nengi's retained
network work; they do not establish how many players your game simulation can
support. Limits belong to one instance, not to a process-wide or per-IP registry.

The 64 KiB default packet limit applies to **client-to-server input**. Before
acceptance, packets also have an 8 KiB handshake limit. Neither limits
server-to-client entity snapshots.

## Configure a deployment

Override only the settings your game needs. Keep the remaining defaults:

```ts
import { DEFAULT_NETWORK_LIMITS, Instance } from 'nengi'

const instance = new Instance(context, {
    limits: {
        maxConnections: 2048,
        maxPendingConnections: 128
    }
})

// Resolved settings are read-only and fixed for this instance's lifetime.
console.log(instance.limits.maxPacketBytes) // 65536
console.log(DEFAULT_NETWORK_LIMITS.maxConnections) // 4096
```

Unknown keys and nonpositive, fractional, infinite or unsafe-integer values
throw during construction. `byteBurst` must be at least `maxPacketBytes`.
There is no magic zero or Infinity value that disables protection. Choose
explicit finite budgets for synthetic loads or larger payloads.

## Defaults and units

| Setting | Default | Meaning |
| --- | --- | --- |
| `maxConnections` | 4,096 | Accepted plus pending connections |
| `maxPendingConnections` | 256 | Connections waiting for a handshake or authentication; part of the total |
| `maxPacketBytes` | 65,536 | Bytes in one incoming nengi packet |
| `maxHandshakeBytes` | 8,192 | Bytes in one incoming packet before acceptance, including handshake JSON and wire metadata |
| `packetsPerSecond` | 1,024 | Per-connection packet credit restored each second |
| `packetBurst` | 2,048 | Maximum per-connection packet credit |
| `bytesPerSecond` | 131,072 | Per-connection byte credit restored each second |
| `byteBurst` | 262,144 | Maximum per-connection byte credit |
| `maxQueuedCommandsPerUser` | 1,024 | Retained command objects, not command batches |
| `maxQueuedCommands` | 65,536 | Retained command objects across the instance |
| `maxQueuedRequestsPerUser` | 128 | Requests waiting to start a handler |
| `maxQueuedRequests` | 65,536 | Waiting requests across the instance |
| `maxQueuedInputBytesPerUser` | 1,048,576 | Charged bytes of retained commands and requests |
| `maxQueuedInputBytes` | 67,108,864 | Charged retained input bytes across the instance |
| `maxQueuedEvents` | 65,536 | Event slots, including reserved lifecycle space |
| `maxQueuedResponsesPerUser` | 1,024 | Replies/errors waiting for snapshot commit |
| `maxQueuedResponses` | 65,536 | Queued replies/errors across the instance |
| `maxQueuedResponseBytesPerUser` | 1,048,576 | Charged queued reply/error bytes |
| `maxQueuedResponseBytes` | 67,108,864 | Charged queued reply/error bytes across the instance |

Per-user and instance ceilings both apply. Meeting one does not waive another.
A large collection of individually permitted bursts can still exhaust a global
budget; that budget protects the instance as a whole.

## Handshake input

`maxHandshakeBytes` rejects oversized packets before constructing a binary reader,
decoding strings or parsing JSON. It also applies while asynchronous `onConnect`
work is pending. After acceptance, `maxPacketBytes` remains the packet ceiling.
Both ceilings apply before acceptance; raising one does not bypass the other.
The transport may already have assembled a message before core rejects it.

Keep setup data small. For a deliberate larger token or setup payload, configure
the complete encoded packet budget, including nengi's metadata:

```ts
const instance = new Instance(context, {
    limits: { maxHandshakeBytes: 16 * 1024 }
})
```

This budget is in bytes, not JavaScript string length, and is not a nesting-depth
limit. Validate the expected shape and field sizes before using handshake or JSON
request data; see [connection setup](./networking-primitives.md#connection-handshake).
Oversize input closes the sender and reports `onNetworkLimit` with
`limit: 'maxHandshakeBytes'`. A client need not receive a detailed refusal.

## Bursts and sustained traffic

Packet and byte credits start full and refill continuously using the server's
monotonic `instance.now` clock. A packet must fit both remaining credits. Credits
do not reset when authentication completes or when `instance.step()` runs.
Empty packets, engine messages, Pong packets, commands and requests all count.
Credits belong to a connection and start afresh on reconnect. Pending-connection
ceilings bound simultaneous attempts, not attempts per second. Use transport or
deployment controls for aggregate connection rates, and application budgets for
expensive authentication work that survive reconnects.
The packet limit is independent of the server tick rate: a 20 Hz server can
legitimately receive a client's 240 Hz render-driven flushes.

A burst allowance handles traffic delivered together after a network delay.
The sustained rate controls how quickly that allowance recovers. Raising only
`maxPacketBytes` does not increase sustained throughput or retained queue space.

For an intentional larger-input workflow, configure the related budgets:

```ts
const instance = new Instance(context, {
    limits: {
        maxPacketBytes: 256 * 1024,
        byteBurst: 512 * 1024,
        bytesPerSecond: 256 * 1024
    }
})
```

The official ws, uWS and Bun server adapters use `instance.limits.maxPacketBytes`
as their default native incoming message cap. Their explicit transport overrides
still apply. A larger native cap does not bypass the core cap; a smaller one may
close the socket before nengi sees the packet. Deno does not expose an equivalent
configurable native receive cap through its adapter. Core rejects oversize input
before decoding, but the transport may already have assembled the message.
Bun and Deno check admission before WebSocket upgrade and return HTTP 503 when full.
See [adapters.md](./adapters.md) and [operations.md](./operations.md).

## Queue ownership and byte accounting

Drain the server event queue through its supported methods:

```ts
while (!instance.queue.isEmpty()) {
    const event = instance.queue.next()
    // Handle connection, command and disconnect events here.
}
```

`next()` and `dequeue()` release that event's input charges. `removeWhere()` and
`clear()` also release charges; use them only when deliberately discarding the
corresponding events. Dropping lifecycle events can skip necessary game cleanup.
Do not mutate or replace `instance.queue.arr`, replace the server queue, or
manually edit nengi's request/response arrays or accounting fields. Those actions
bypass the supported queue lifecycle. Existing client internals may use backing
arrays; that is not a server-consumer pattern to copy.

Dequeuing transfers ownership of the work to game code. If the game retains
those events in another array, nengi cannot budget that array. Drain and process
commands, complete simulation, explicitly confirm the completed input prefix,
then call `instance.step()` as explained in
[architecture-and-ticks.md](./architecture-and-ticks.md). Removing input from a
queue does not by itself complete or confirm it. Game-owned deferred queues need
their own bounds; leave that input unconfirmed until its work is finished.

Requests release their queue charge when dequeued to start a handler, or when
purged on disconnect. Earlier valid command events remain charged after their
user disconnects until the game drains/removes them. Reconnecting cannot reclaim
space still occupied by old commands. Queued responses release their charges on
successful snapshot commit or disconnect; a write failure before commit retains
them. A later transport send failure disconnects the user.

Byte charges are conservative encoded-data accounting, **not heap measurements**:

- A command batch is charged the entire incoming packet length, including engine
  and timing data. A mixed packet can therefore be charged in both categories.
- Each request adds its declared payload length plus its 12-byte request header.
- Each response adds its encoded payload length plus its 9-byte response header.

Object overhead, decoded strings, transport/TLS/kernel buffers and application
work use additional memory. JSON responses retain their serialized string;
schema-backed responses copy their schema fields when queued, keeping the
queued values and byte charge independent of later application edits.

## What happens when a limit is exceeded

A connection, traffic or accumulated queue excess closes its sender immediately at the nengi level and uses hard
transport termination where available. Nengi does not silently truncate command
batches, retry dropped input, or send a success confirmation for discarded work.
Existing disconnected-user command handling still applies to earlier events.
Requests not yet started and queued responses are purged for that user.

A server-produced reply that cannot fit even in an empty response byte budget
instead becomes a small `RESPONSE_TOO_LARGE` error when possible. Its originating
handler is diagnosed through `instance.onRequestError`. Fallback errors consume
normal queue budgets too; a full queue or a budget smaller than the fallback
still closes the user. Invalid response encoding is handled similarly. These
faults do not undo the requested action. See [request failures](./operations.md#request-failures).

Already admitted users have reserved event capacity for lifecycle completion.
A pending user reserves two slots and an accepted user reserves one disconnect
slot. Command batches cannot consume this space. Under reconnect churn, nengi
stops admitting connections before the event queue loses cleanup capacity.
New admissions reclaim expired pending handshakes before checking capacity.
They still reserve queue slots, so a service must keep draining events even when
its simulation is idle. This housekeeping adds no background server timer.

Admission refusals do not enqueue one `UserConnectionDenied` event per attempt;
that would recreate an unbounded queue. Normal authentication denials and
handshake timeouts for admitted users still produce their usual denial events.
An accepted user closed for a limit produces `UserDisconnected` with reason
`network_limit`. Use the server diagnostic hook for the exact limit:

```ts
instance.onNetworkLimit = ({ user, limit, value, maximum }) => {
    metrics.increment('nengi.network_limit', { limit })
    // Optional bounded diagnostics: user.id, value, maximum.
}
```

This callback runs after logical cleanup. It carries no raw packet and must be
small; aggregate repeated refusals rather than generating unlimited logs.
Observer exceptions are contained. `packetBurst` and `byteBurst` diagnostics
mean the respective remaining credit was insufficient; their sustained rate
settings determine refill. The diagnostic value is attempted budget usage.
Native transport rejection can happen before this hook; clients may receive a
generic disconnect rather than the server's diagnostic reason. Reconnect with
application backoff, not an immediate retry loop.

## Engine controls and transport frames

Nengi validates controls that game command/request handlers do not receive.
Only engine messages, commands and requests are valid client packet sections.
Entity/snapshot updates, responses, channel operations and other server sections
close their sender. Inside engine messages, server-only or unknown types are
rejected before their bodies are decoded.

The initial `ConnectionAttempt` is permitted only before authentication begins.
`CommandFrameNumber`, `CommandTiming`, `InterpolationDelay` and nengi `Pong`
require an accepted connection. Frame numbers advance at most once per packet;
a repeated, zero or non-advancing counter is invalid. Skipped numbers remain
permitted; a client counter is a correlation value, not proof of game progress.
Timing must refer to a command in that packet, with at most one timing record
per command. Only one interpolation-delay report is allowed per packet.

A client packet permits at most 512 engine records and 512 total sections,
including empty sections. These fixed protocol ceilings apply across repeated
sections and are separate from configurable traffic/queue budgets. The client
encoder splits engine records into sections of at most 255, allowing a complete
255-command timing batch plus ordinary controls. It keeps only the latest delay
report before a flush, and rejects oversized batches instead of truncating their
one-byte counts. Use `Client.flush()` so a failed encode rolls back pending
outbound work. A transport send failure ends the session and rejects its pending
requests; it cannot guarantee that the server did not receive the packet.

Engine controls are applied after structural validation of the complete packet.
A valid control prefix followed by a malformed suffix does not advance the
frame counter, consume a ping or refresh liveness. Invalid control structure is
reported through `onInboundMessageError` and closes the sender; byte/rate/queue
excesses use `onNetworkLimit`.

Clock/timing fields must be finite. Negative render/interpolation delays and
reversed Pong timestamps are invalid. Command timing and accepted clock samples
also require client timing magnitudes within `Number.MAX_SAFE_INTEGER`
(milliseconds for timestamps/delays; fractional values remain allowed). Derived
estimates must remain finite. Unknown/replayed Pong IDs are ignored. Implausible
finite Pong samples are also ignored without consuming the ping or refreshing
liveness: reported processing time cannot exceed the server-observed trip, with
1 ms tolerance for clock rounding. Delayed replies to outstanding pings remain
valid. These checks cannot prove that plausible client timestamps are truthful;
see [timing-and-liveness.md](./timing-and-liveness.md) for the game trust boundary.

All official server adapters reject WebSocket text data. Native WebSocket
Ping/Pong frames are distinct from nengi clock messages: they cannot update
nengi clock samples or satisfy its Pong deadline. ws, uWS and Bun charge received
native Ping/Pong callbacks to the same packet/byte credits as binary data.
An excess terminates the sender where native termination is available. Native
handling or an automatic Pong reply may occur before the callback runs.

Deno's WebSocket API does not expose native Ping/Pong callbacks to this adapter,
so those frames cannot be charged by nengi there. WebSocket fragmentation,
HTTP upgrade parsing, TLS and work before a native callback remain transport or
deployment responsibilities. Do not interpret core budgets as a limit on every
network frame or all process CPU/memory use. Custom adapters should pass exposed
native Ping/Pong payload lengths to `network.onTransportControl(user, bytes)`;
its false result means the user is closed and the callback should stop.

## Application responsibilities and migration

Authenticate handshakes, authorize every action and limit expensive work before
starting it. Use the `onConnect(handshake, { user, signal })` cancellation context
to stop abandoned authentication and release attempt-owned reservations. See
[setup ownership](./networking-primitives.md#cancellation-and-setup-ownership).
A pending-connection ceiling and an aborted signal cannot forcibly stop arbitrary
application work. Global job limits must survive reconnects, and non-cancellable
work needs its own budget and cleanup when it eventually completes.
Similarly, `instance.processRequests(max)` limits dequeues per call, not promise
concurrency, database duration or external side effects. Client request timeouts
and deduplication policies do not constrain a modified client.

When updating a demo or load test:

- Keep the normal input/simulation/snapshot order and drain lifecycle events.
- Use queue methods instead of backing-array mutation.
- Configure large client uploads explicitly, including burst and queue budgets.
- A packet can encode 255 requests, but the default retained-request allowance
  is 128 per user. Deliberate larger request batches need an override such as
  `maxQueuedRequestsPerUser: 512`; the wire format has not changed.
- Record exceeded-limit diagnostics and measure normal peaks before increasing
  a budget. If a queue grows continually, repair its production/drain imbalance
  rather than only increasing its ceiling.

Server snapshot size is controlled separately by the adapter's outgoing buffer
budget. Per-instance connection limits do not bound process-wide socket counts,
HTTP upgrade load, or application state held outside nengi.
