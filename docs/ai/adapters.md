# Adapters

Nengi core does not own a socket library or a binary backing store. A runtime
integration supplies:

- a server adapter implementing `IServerNetworkAdapter`
- a client adapter implementing `IClientNetworkAdapter`
- a binary adapter implementing `BinaryAdapter`

This keeps the core usable in browsers, Node services, bots, tests, embedded
servers, and future transports. For a complete browser/Node application, start
with [getting started](./getting-started.md); the snippets here isolate transport
setup. Before accepting real users, supply the game's connection validation.
An Instance without `onConnect` denies connections.

## Package compatibility

Core, socket adapters and binary backends are independently versioned. Install
packages whose declared dependency and peer-dependency ranges agree. A core
upgrade does not require republishing or upgrading an unchanged compatible
adapter. Keep a lockfile to make the installed combination reproducible.

The `2.0.0-rc.128` baseline introduces client adapter contract 2 and server
adapter contract 1. Upgrade from rc.127 with compatible new adapters and binary
backends; the older exact-version packages do not implement this baseline.
These initial package numbers coincide, but equality is not a continuing rule:

```text
nengi@2.0.0-rc.128
nengi-websocket-client-adapter@2.0.0-rc.128
nengi-ws-client-adapter@2.0.0-rc.128
nengi-ws-instance-adapter@2.0.0-rc.128
nengi-uws-instance-adapter@2.0.0-rc.128
nengi-bun-instance-adapter@2.0.0-rc.128
nengi-deno-instance-adapter@2.0.0-rc.128
nengi-dataviews@2.0.0-rc.128
nengi-buffers@2.0.0-rc.128
```

The baseline peer range is `>=2.0.0-rc.128 <2.0.0`. It admits subsequent RCs on
this compatible integration boundary and excludes rc.127, the stable release
and other prerelease trains. Read [package compatibility](./package-compatibility.md)
for contract versions, wire compatibility and future stable-release policy.

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

The client snippets use `SERVER_TICK_RATE` from shared game configuration.
Set it to the server's `instance.step()` frequency, as described in
[shared snapshot rate](./architecture-and-ticks.md#shared-snapshot-rate).

## Browser Client

Install a compatible core, browser WebSocket adapter and binary backend. The
pending baseline uses:

```bash
npm install nengi@2.0.0-rc.128 \
    nengi-websocket-client-adapter@2.0.0-rc.128 \
    nengi-dataviews@2.0.0-rc.128
```

Use the package root for core imports and the adapter package root for the
adapter import:

```ts
import { SERVER_TICK_RATE } from '../shared/network-config'
import { Client } from 'nengi'
import { WebSocketClientAdapter } from 'nengi-websocket-client-adapter'

const client = new Client(context, WebSocketClientAdapter, SERVER_TICK_RATE)
await client.connect('ws://localhost:8079')
```

The optional second `connect` argument is the JSON-serializable connection
setup payload. Use it for authentication or session selection data that
`instance.onConnect` validates before accepting the socket.

## Node Server With ws

Install a compatible core, `ws` server adapter and Node binary backend:

```bash
npm install nengi@2.0.0-rc.128 \
    nengi-ws-instance-adapter@2.0.0-rc.128 \
    nengi-buffers@2.0.0-rc.128
```

Use this adapter when compatibility and simple deployment matter more than
maximum socket throughput:

```ts
import { Instance } from 'nengi'
import { WsInstanceAdapter } from 'nengi-ws-instance-adapter'

const instance = new Instance(context)
instance.onConnect = async () => true // Local demo; substitute the game's admission policy.
const adapter = new WsInstanceAdapter(instance.adapterHost)

adapter.listen(8079, () => {
    console.log('listening')
})
```

`WsInstanceAdapter.listen` accepts a port number or an options object such as
`{ port, host }`.

## Node Server With uWS

Install a compatible core, uWS server adapter and Node binary backend:

```bash
npm install nengi@2.0.0-rc.128 \
    nengi-uws-instance-adapter@2.0.0-rc.128 \
    nengi-buffers@2.0.0-rc.128
```

Use uWS when the deployment Node version is supported by the native
`uWebSockets.js` package selected by the adapter:

```ts
import { Instance } from 'nengi'
import { UwsInstanceAdapter } from 'nengi-uws-instance-adapter'

const instance = new Instance(context)
instance.onConnect = async () => true // Local demo; substitute the game's admission policy.
const adapter = new UwsInstanceAdapter(instance.adapterHost)

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

Install a compatible core, native Bun server adapter and DataView binary backend:

```bash
bun add nengi@2.0.0-rc.128 \
    nengi-bun-instance-adapter@2.0.0-rc.128 \
    nengi-dataviews@2.0.0-rc.128
```

```ts
import { Instance } from 'nengi'
import { BunInstanceAdapter } from 'nengi-bun-instance-adapter'

const instance = new Instance(context)
instance.onConnect = async () => true // Local demo; substitute the game's admission policy.
const adapter = new BunInstanceAdapter(instance.adapterHost)

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

Install a compatible core, native Deno server adapter and DataView binary backend:

```bash
deno add npm:nengi@2.0.0-rc.128 \
    npm:nengi-deno-instance-adapter@2.0.0-rc.128 \
    npm:nengi-dataviews@2.0.0-rc.128
```

```ts
import { Instance } from 'npm:nengi@2.0.0-rc.128'
import { DenoInstanceAdapter } from 'npm:nengi-deno-instance-adapter@2.0.0-rc.128'

const instance = new Instance(context)
instance.onConnect = async () => true // Local demo; substitute the game's admission policy.
const adapter = new DenoInstanceAdapter(instance.adapterHost)

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

Install a compatible core, Node client adapter and Node binary backend:

```bash
npm install nengi@2.0.0-rc.128 \
    nengi-ws-client-adapter@2.0.0-rc.128 \
    nengi-buffers@2.0.0-rc.128
```

```ts
import { SERVER_TICK_RATE } from '../shared/network-config'
import { Client } from 'nengi'
import { WsClientAdapter } from 'nengi-ws-client-adapter'

const client = new Client(context, WsClientAdapter, SERVER_TICK_RATE)
await client.connect('ws://localhost:8079', { role: 'bot' })
```

This is the normal adapter shape for Node bots and command-line tools. A bot
should use the regular `Client` receive path, drain frames, perform meaningful
actions with `addCommand` or `request`, and call `flush` at its chosen cadence.
Keep bot protocol definitions shared with the game client and keep all package
versions compatible with the server's core release. See
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
instance.onConnect = async () => true // Local demo; substitute the game's admission policy.
const serverAdapter = new LocalInstanceAdapter(instance.adapterHost, {
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

## Server shutdown

Every official server adapter, including local and simulated-local adapters,
exposes `shutdown(reason?): Promise<void>`. It is terminal and idempotent:
repeated calls return the same Promise, and `listen()` after shutdown throws.
Create a new adapter to listen again.

The call immediately prevents further admissions through that adapter and
logically disconnects its accepted users and pending handshakes. Core releases
their subscriptions and queued requests through normal disconnect cleanup.
An asynchronous handshake cannot later resurrect the session. Another adapter
on the same Instance continues running.

The Promise waits for the adapter's owned listener to close. Shutdown uses hard
transport termination where available; Deno uses its WebSocket close operation,
so physical socket closure depends on the runtime. It does not promise delivery
of a final queued message, cancel application async work, drain game events, save
the game, or stop the game's timers. A reason is available to server disconnect
events; hard termination need not deliver it to the remote client.

```ts
clearInterval(ticking)
await adapter.shutdown('Maintenance')
processRemainingLifecycleEvents() // Retire this game's players and references.
await saveGame()
```

Respect any game-specific root retirement boundary when processing those events.
Bun and Deno retain `close()` as deprecated aliases. `LocalInstanceAdapter.close(socket)`
still closes one local socket; use `shutdown()` for the whole adapter. If the
application supplies a shared HTTP server to a Bun/Deno upgrade handler, it owns
that HTTP server and must close it separately.

## Binary Boundary

For a browser or typed-array transport, use `nengi-dataviews`. For Node
transports such as `ws`, uWS, bots, and command-line tools, use
`nengi-buffers`.

The core contract is `BinaryAdapter<InboundPayload, OutboundPayload>`. An
adapter translates transport payloads into the selected binary backend at the
edge; core gameplay code should not depend on `Buffer`, `ArrayBuffer`, TCP,
WebSocket, or uWS types.

`binary.createWriter(byteLength)` must return a writer with a numeric `offset`
initially zero and a `payload` of exactly `byteLength` bytes. Advance `offset` by
the bytes each operation writes, relative to that payload. A view into a larger
allocation is supported; expose only the intended view as `payload`.
`IBinaryWriter.offset` is required. Official Buffer and DataView backends already
satisfy this contract. Core checks completed allocations before caching or sending
them; see [binary diagnostics](./operations.md#binary-diagnostics).

## Adapter Contracts

### Server adapter contract version 1

Construct server adapters with `instance.adapterHost`. This exposes the
`ServerAdapterHost` interface, not the game-facing `InstanceNetwork`. It is a
view of the existing network object, with no per-packet proxy or extra connection
object. An adapter depends on structural transport types, not the private layout
of `User` or `Instance`.

A server adapter must:

- expose `readonly serverAdapterVersion = 1 as const` and `binary`; check the
  host's `serverAdapterVersion` when constructed and reject unsupported versions
- create each connection with `host.createConnection(socket, this, remoteAddress)`
  and retain the returned `ServerConnection<Socket>`. Do not construct or cast a
  `User`, manufacture connection records, or pass one host's connection to another
- attach socket callbacks, then call `host.onOpen(connection)` before delivering
  input. Transport open reserves admission; it does not accept a nengi handshake
- call `host.onMessage(connection, payload)` for complete, ordered binary packets
  and `host.onClose(connection, reason?)` when the transport ends
- report asynchronous transport failures through
  `host.disconnectUser(connection, error, true)`. For invalid native messages,
  use `host.notifyInboundMessageError(...)` followed by disconnect; native control
  traffic that bypasses decoding must pass `host.onTransportControl(...)`
- implement `send(connection, payload)`: synchronously accept/own the bytes or
  throw. An accepted send with backpressure is valid; silently dropping a
  committed snapshot is not. A later write failure must disconnect the session
- implement `disconnect(connection, reason)` and, where supported,
  `terminate(connection, reason)` for immediate transport destruction. Core has
  already performed logical cleanup before calling either. Repeated close
  callbacks are safe, and `connection.isClosed` prevents late callbacks from
  touching a retired native socket
- implement terminal, idempotent `shutdown(reason?): Promise<void>`. Cache its
  Promise before cleanup, synchronously call `host.shutdownAdapter(this, reason)`,
  then close the listener and transport resources owned by that adapter

`connection.socket` and `connection.remoteAddress` are transport metadata owned
by the adapter. `connection.id` and `connection.isClosed` are observations owned
by core; neither gives permission to alter gameplay state. For HTTP upgrade
admission, create `ServerConnection<Socket | null>` with a null socket and call
`onOpen` before upgrading. Refuse the upgrade if `isClosed`; otherwise attach the
socket when ready. A failed upgrade must call `onClose`. If a deadline or shutdown
closed the reservation before the socket arrived, close that socket immediately.
`onOpen` is idempotent for the same connection.

Use `host.limits.maxPacketBytes` to configure native packet limits. Native socket
libraries differ: configure their available payload limits, backpressure and
termination mechanisms in addition to core's shared budgets. Do not add a new
nengi handshake, admission queue, request scheduler or heartbeat in the adapter.

The contract marker versions this local integration boundary. It is separate
from `WIRE_PROTOCOL_VERSION` (the bytes exchanged with a peer) and the npm package
version. Package ranges express supported core releases; the marker detects an
incompatible local transport contract during setup. See
[package compatibility](./package-compatibility.md).

### Client adapter contract version 2

Client adapter contract version 2 is transport-only. Its constructor accepts
`config?`, without a `ClientNetwork` argument. It must:

- expose `readonly clientAdapterVersion = 2` and `binary`
- implement `open(target, handlers): void`, reporting transport open, binary
  message, close and error through `ClientTransportHandlers`
- implement `send(payload): void`, throwing or reporting `onError` on failure;
  an asynchronous send failure must also report `onError`. If native state has
  already become `CLOSING`/`CLOSED` while its close callback is pending, discard
  the payload and preserve that callback's reason. Apply this check to delayed
  simulated deliveries too. Missing/connecting sockets still fail
- implement `close(reason: string, force: boolean): void`, invalidating callbacks
  and clearing delayed deliveries before closing; core supplies a short safe code
- keep each attempt's callbacks tied to that transport. Old callbacks must not
  close, decode into, or clear a replacement attempt

Core sends and validates the handshake, owns `client.connectionState`, encodes
application flushes, sends automatic Pongs, enforces deadlines, settles connection
Promises and notifies disconnects. Do not duplicate these responsibilities in an
adapter. A successful transport open is not nengi acceptance. Core also checks
attempt identity, so abandoned callbacks cannot revive its state.

Returning from `send` does not acknowledge delivery or resolve a request. A
pending native close settles through `onClose`; outstanding requests reject
with `DISCONNECTED`, with the action's outcome potentially unknown. Core's
configured connection/receive deadlines still apply if the native close never
arrives. Genuine transport error events and write failures still report `onError`.

Node transports should terminate when `force` is true or a socket has not opened;
normal close can complete its bounded closing handshake asynchronously. Browsers
have only best-effort `close()`: detach callbacks first and tolerate later events.
A cleanup exception must never leave callbacks attached to a live attempt. Native
socket state is diagnostic; gameplay reads `client.connectionState`.

Old adapters implementing `connect`, `flush`, `flushPongs` and `disconnect` are
incompatible. Update core and client adapters together. No wire-format change is
needed for these locally configured lifecycle rules. See
[migration](./migration.md#rc-128-client-connection-lifecycle).

Core game code should import only from the package root. Deep imports into
`nengi/src` or `nengi/build` are not part of the package contract.
