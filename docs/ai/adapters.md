# Adapters

Nengi core does not own a socket library or a binary backing store. A runtime
integration supplies:

- a server adapter implementing `IServerNetworkAdapter`
- a client adapter implementing `IClientNetworkAdapter`
- a binary adapter implementing `BinaryAdapter`

This keeps the core usable in browsers, Node services, bots, tests, embedded
servers, and future transports.

## Version Rule

The core package and every official Nengi adapter or binary package used by an
application must have the exact same version. Do not use `^`, `~`, `latest`, or
an unpinned range for release-candidate work.

For this release candidate, the package version is `2.0.0-rc.127`:

```text
nengi@2.0.0-rc.127
nengi-websocket-client-adapter@2.0.0-rc.127
nengi-ws-client-adapter@2.0.0-rc.127
nengi-ws-instance-adapter@2.0.0-rc.127
nengi-uws-instance-adapter@2.0.0-rc.127
nengi-bun-instance-adapter@2.0.0-rc.127
nengi-deno-instance-adapter@2.0.0-rc.127
nengi-dataviews@2.0.0-rc.127
nengi-buffers@2.0.0-rc.127
```

When the core version changes, change every installed official package to that
same version. Do not mix an older adapter with a newer core, even when the
package manager accepts the dependency graph. Matching versions protect both
the binary protocol contract and TypeScript's private type identities.

Verify the installed graph with:

```bash
npm ls nengi nengi-dataviews nengi-buffers \
    nengi-websocket-client-adapter nengi-ws-client-adapter \
    nengi-ws-instance-adapter nengi-uws-instance-adapter \
    nengi-bun-instance-adapter nengi-deno-instance-adapter
```

There should be one core `nengi` identity. Duplicate private-field TypeScript
errors involving `User`, `InstanceNetwork`, `Channel`, or `IChannel` usually
mean that the application has two copies of nengi or mixes package imports with
deep source/build imports.

## Package Roles

| Package | Role |
| --- | --- |
| `nengi` | Core protocol, channels, client/server state, and in-memory adapters |
| `nengi-websocket-client-adapter` | Browser WebSocket client |
| `nengi-ws-client-adapter` | Node `ws` client for bots and tools |
| `nengi-ws-instance-adapter` | Node `ws` server |
| `nengi-uws-instance-adapter` | uWebSockets.js server |
| `nengi-bun-instance-adapter` | Native Bun server |
| `nengi-deno-instance-adapter` | Native Deno server |
| `nengi-dataviews` | Browser/DataView binary backend |
| `nengi-buffers` | Node Buffer binary backend |

Client and server adapters are not interchangeable. Binary backends are chosen
from the payload type available at the transport boundary.

## Browser Client

Install the core, browser WebSocket adapter, and browser binary backend at the
same version:

```bash
npm install nengi@2.0.0-rc.127 \
    nengi-websocket-client-adapter@2.0.0-rc.127 \
    nengi-dataviews@2.0.0-rc.127
```

Use the package root for core imports and the adapter package root for the
adapter import:

```ts
import { Client } from 'nengi'
import { WebSocketClientAdapter } from 'nengi-websocket-client-adapter'

const client = new Client(context, WebSocketClientAdapter, serverTickRate)
await client.connect('ws://localhost:8079')
```

The optional second `connect` argument is the JSON-serializable connection
setup payload. Use it for authentication or session selection data that
`instance.onConnect` validates before accepting the socket.

## Node Server With ws

Install the core, `ws` server adapter, and Node binary backend at one version:

```bash
npm install nengi@2.0.0-rc.127 \
    nengi-ws-instance-adapter@2.0.0-rc.127 \
    nengi-buffers@2.0.0-rc.127
```

Use this adapter when compatibility and simple deployment matter more than
maximum socket throughput:

```ts
import { Instance } from 'nengi'
import { WsInstanceAdapter } from 'nengi-ws-instance-adapter'

const instance = new Instance(context)
const adapter = new WsInstanceAdapter(instance.network)

adapter.listen(8079, () => {
    console.log('listening')
})
```

`WsInstanceAdapter.listen` accepts a port number or an options object such as
`{ port, host }`.

## Node Server With uWS

Install the core, uWS server adapter, and Node binary backend at one version:

```bash
npm install nengi@2.0.0-rc.127 \
    nengi-uws-instance-adapter@2.0.0-rc.127 \
    nengi-buffers@2.0.0-rc.127
```

Use uWS when the deployment Node version is supported by the native
`uWebSockets.js` package selected by the adapter:

```ts
import { Instance } from 'nengi'
import { UwsInstanceAdapter } from 'nengi-uws-instance-adapter'

const instance = new Instance(context)
const adapter = new UwsInstanceAdapter(instance.network)

adapter.listen({
    host: '0.0.0.0',
    port: 8079,
    path: '/*'
})
```

For direct TLS, pass the adapter's SSL options:

```ts
adapter.listen({
    port: 8079,
    ssl: true,
    appOptions: {
        key_file_name: 'server.key',
        cert_file_name: 'server.crt'
    }
})
```

Before deploying a uWS server, verify the active Node version and ABI:

```bash
node -p "process.version + ' abi=' + process.versions.modules"
```

If the native module is unavailable, use a Node version supported by the
installed uWS release or select a compatible adapter release. Do not change
the native dependency tag without testing the target operating system and Node
version.

## Bun Server

Install the core, native Bun server adapter, and DataView binary backend at one
version:

```bash
bun add nengi@2.0.0-rc.127 \
    nengi-bun-instance-adapter@2.0.0-rc.127 \
    nengi-dataviews@2.0.0-rc.127
```

```ts
import { Instance } from 'nengi'
import { BunInstanceAdapter } from 'nengi-bun-instance-adapter'

const instance = new Instance(context)
const adapter = new BunInstanceAdapter(instance.network)

adapter.listen({ port: 8079, hostname: '0.0.0.0' })
```

For an application that already owns `Bun.serve`, install
`adapter.websocket` as its WebSocket handler and route the Nengi endpoint to
`adapter.upgrade(request, server)`. The adapter uses Bun's hard
`ServerWebSocket.terminate()` path for Nengi deadlines and send failures.
Admission is checked before upgrade; a full instance returns HTTP 503.

On tested Bun 1.3.14, a server-initiated WebSocket close could leave
`server.stop(true)` unresolved even after the socket close event. This also
reproduced without nengi. Core user cleanup remains immediate; verify native
shutdown on the Bun version you deploy. Pre-upgrade admission refusals avoid
creating the refused socket.

## Deno Server

Install the core, native Deno server adapter, and DataView binary backend at
one version:

```bash
deno add npm:nengi@2.0.0-rc.127 \
    npm:nengi-deno-instance-adapter@2.0.0-rc.127 \
    npm:nengi-dataviews@2.0.0-rc.127
```

```ts
import { Instance } from 'npm:nengi@2.0.0-rc.127'
import { DenoInstanceAdapter } from 'npm:nengi-deno-instance-adapter@2.0.0-rc.127'

const instance = new Instance(context)
const adapter = new DenoInstanceAdapter(instance.network)

adapter.listen({ port: 8079, hostname: '0.0.0.0' })
```

For an application that already owns `Deno.serve`, route the Nengi endpoint to
`adapter.handle(request, info)`. Admission is checked before upgrade; a full
instance returns HTTP 503. Deno server WebSockets do not expose hard
transport termination. Nengi still removes a timed-out user and its channel
subscriptions synchronously, then the adapter requests a WebSocket close; the
adapter's longer Deno idle timeout remains the transport fallback.

On tested Deno 2.9.5, immediate server-side WebSocket refusal with the native
idle timeout enabled could keep the process alive after close events and server
shutdown. This also reproduced without nengi. Pre-upgrade refusals avoid that
socket; verify later server-initiated close/shutdown on the runtime you deploy.

Both native adapters reject text protocol messages and bound queued outbound
bytes with `maxBufferedBytes`, defaulting to 4 MiB. A send that would exceed the
limit throws, which invokes Nengi's normal snapshot-send error reporting and
immediate user cleanup. Tune the limit for measured snapshot sizes; do not use
it as an ordinary packet-dropping policy because Nengi snapshots are an
ordered reliable stream.

## Node Client

Install the core, Node client adapter, and Node binary backend at one version:

```bash
npm install nengi@2.0.0-rc.127 \
    nengi-ws-client-adapter@2.0.0-rc.127 \
    nengi-buffers@2.0.0-rc.127
```

```ts
import { Client } from 'nengi'
import { WsClientAdapter } from 'nengi-ws-client-adapter'

const client = new Client(context, WsClientAdapter, serverTickRate)
await client.connect('ws://localhost:8079', { role: 'bot' })
```

This is the normal adapter shape for Node bots and command-line tools. A bot
should use the regular `Client` receive path, drain frames, perform meaningful
actions with `addCommand` or `request`, and call `flush` at its chosen cadence.
Keep bot protocol definitions shared with the game client and keep all package
versions exactly aligned with the server's Nengi installation. See
[benchmarking.md](./benchmarking.md) for maintained bot scenarios, stress
shapes, and connection churn.

## In-Memory Tests

Use `LocalInstanceAdapter` and `LocalClientAdapter` from the core package for
deterministic tests and embedded simulations. They exercise handshake,
commands, requests, snapshots, and binary reader/writer paths without opening a
socket.

Choose a binary backend whose payload type matches the test environment:

- browser-shaped tests: `nengi-dataviews`
- Node-shaped tests: `nengi-buffers`

```ts
import { Client, Instance, LocalClientAdapter, LocalInstanceAdapter } from 'nengi'
import { dataViewBinary } from 'nengi-dataviews'

const instance = new Instance(context)
const serverAdapter = new LocalInstanceAdapter(instance.network, {
    binary: dataViewBinary
})
const serverSocket = serverAdapter.createMockConnect()

const client = new Client(context, LocalClientAdapter, 20, {
    binary: dataViewBinary
})
await client.connect(serverSocket.clientSocket, { role: 'local' })
```

When delay is part of the behavior under test, use
`SimulatedLocalInstanceAdapter` and `SimulatedLocalClientAdapter`. They run the
same binary protocol over a seeded, manually advanced duplex link. For live
browser or Node clients, use `SimulatedWebSocketClientAdapter` or
`SimulatedWsClientAdapter`. See
[network-condition-simulation.md](./network-condition-simulation.md) for the
condition model, clock order, and diagnostics.

## Binary Boundary

For a browser or typed-array transport, use `nengi-dataviews`. For Node
transports such as `ws`, uWS, bots, and command-line tools, use
`nengi-buffers`.

The core contract is `BinaryAdapter<InboundPayload, OutboundPayload>`. An
adapter translates transport payloads into the selected binary backend at the
edge; core gameplay code should not depend on `Buffer`, `ArrayBuffer`, TCP,
WebSocket, or uWS types.

## Adapter Contracts

A server adapter must:

- expose `binary`
- create `User` objects for accepted sockets
- call `instance.network.onOpen(user)` on connection
- call `instance.network.onMessage(user, payload)` for binary input
- call `instance.network.onClose(user)` on close
- implement `send(user, payload)` and `disconnect(user, reason)`
- implement `terminate(user, reason)` when the transport supports immediate
  destruction of an unresponsive socket; nengi uses it for forced cleanup
  (including heartbeat and handshake deadlines) and falls back to `disconnect`
  when it is absent. If an ordinary `disconnect` throws, nengi attempts
  `terminate` once when available. Logical user cleanup occurs before either
  transport call, and repeated close callbacks are safe

A client adapter must:

- expose `binary`
- implement `connect(target, handshake = {})`
- send the handshake through nengi after opening
- implement `flush()` with `client.network.createOutbound(binary)`
- pass inbound payloads to `client.network.readSnapshot(...)`
- implement `flushPongs()` by calling
  `client.network.flushPongs(binary, sendPayload)` while the transport is open;
  `readSnapshot(...)` invokes this hook after parsing a Ping so heartbeat
  traffic does not depend on the application loop
- call the client network disconnect and socket-error hooks appropriately

`flushPongs()` must send only the payload supplied by `network.flushPongs`.
Do not implement it by calling the adapter's ordinary `flush()`: that would
advance command frames and flush application commands and requests from inside
an inbound socket callback. If transport send throws, `network.flushPongs`
leaves the Pong queued and the adapter should report the error through
`network.onSocketError`.

Core game code should import only from the package root. Deep imports into
`nengi/src` or `nengi/build` are not part of the package contract.
