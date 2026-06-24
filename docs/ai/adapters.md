# Adapters

Nengi core does not own a socket library or a binary backing store. A runtime
integration provides:

- a server adapter implementing `IServerNetworkAdapter`
- a client adapter implementing `IClientNetworkAdapter`
- a binary adapter implementing `BinaryAdapter`

This keeps the core usable in Node, browsers, Electron, tests, local
single-player modes, bots, and future transports.

## Quick Selection

Choose the adapter based on where the code runs and what the game needs.

| Situation | Server adapter | Client adapter | Binary backend |
| --- | --- | --- | --- |
| Browser game client connecting to a Node server | `nengi-ws-instance-adapter` or `nengi-uws-instance-adapter` | `nengi-websocket-client-adapter` | server: `nengi-buffers`, browser: `nengi-dataviews` |
| Performance-focused Node game server | `nengi-uws-instance-adapter` | browser or bot adapter | server: `nengi-buffers` |
| Simple Node server or broad Node compatibility | `nengi-ws-instance-adapter` | browser or bot adapter | server: `nengi-buffers` |
| Bot, load test, admin script, or Node tool | matching server adapter | `nengi-ws-client-adapter` | `nengi-buffers` |
| Single-player mode, embedded server, or deterministic test | `LocalInstanceAdapter` from `nengi` | `LocalClientAdapter` from `nengi` | any matching `BinaryAdapter` |
| Browser-hosted experiment with no Node socket | local/custom adapter | local/custom adapter | `nengi-dataviews` |

Default recommendation for a real game server: use `nengi-uws-instance-adapter`
when its Node support fits the deployment target; otherwise use
`nengi-ws-instance-adapter`.

Default recommendation for a browser game client: use
`nengi-websocket-client-adapter`.

Default recommendation for bots and command-line clients: use
`nengi-ws-client-adapter`.

## Install Shape

During this R&D workspace, packages often use local `file:` dependencies so new
prototype projects can run against the current source:

```json
{
  "dependencies": {
    "nengi": "file:../../nengi",
    "nengi-uws-instance-adapter": "file:../../nengi-uws-instance-adapter"
  }
}
```

For a published game project, install packages normally:

```bash
npm install nengi nengi-websocket-client-adapter
npm install nengi nengi-uws-instance-adapter
```

For a Node bot or load-test client:

```bash
npm install nengi nengi-ws-client-adapter
```

Published official adapters should declare a compatible `nengi` peer dependency
so a game does not accidentally install two separate copies of nengi core. If an
AI sees duplicate private-field TypeScript errors involving `User`,
`InstanceNetwork`, `Channel`, or `IChannel`, suspect that the project has two
different nengi copies or is mixing `nengi/src` imports with adapter package
types from `nengi/build`.

For local R&D projects that use official adapter packages, prefer importing
nengi through package `nengi` everywhere. Do not re-export from
`../../../nengi/src` in `shared/nengi.ts` while also importing
`nengi-ws-instance-adapter`, `nengi-websocket-client-adapter`, or other adapter
packages. The adapter packages compile against package `nengi`; the game should
use the same package-facing type identity.

## Current Packages

The workspace contains these adapter-related packages:

- `nengi-websocket-client-adapter`: browser WebSocket client adapter.
- `nengi-ws-client-adapter`: Node `ws` client adapter for bots/tools.
- `nengi-ws-instance-adapter`: Node `ws` server adapter.
- `nengi-uws-instance-adapter`: Node `uWebSockets.js` server adapter.
- `nengi-dataviews`: browser/DataView binary adapter.
- `nengi-buffers`: Node Buffer binary adapter.

`nengi-uws-instance-adapter` is important for performance-minded game
developers. Keep it working unless there is a strong reason to remove it.

## Browser Client

```ts
import { Client } from 'nengi'
import { WebSocketClientAdapter } from 'nengi-websocket-client-adapter'

const client = new Client(context, WebSocketClientAdapter, serverTickRate)
await client.connect('ws://localhost:8079', handshake)
```

The adapter is responsible for:

- opening the socket
- sending outbound binary payloads
- reading inbound binary payloads
- exposing its `binary` adapter so nengi can write/read packets

## Node Server With ws

Use `ws` when compatibility and simplicity matter more than maximum throughput.

```ts
import { Instance } from 'nengi'
import { WsInstanceAdapter } from 'nengi-ws-instance-adapter'

const instance = new Instance(context)
const adapter = new WsInstanceAdapter(instance.network)

adapter.listen(8079, () => {
    console.log('listening')
})
```

`WsInstanceAdapter` accepts either a port number or an options object such as
`{ port, host }`.

## Node Server With uWS

Use `uWebSockets.js` when server socket performance matters and the deployment
Node version is supported by the pinned `uWebSockets.js` release.

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

For direct TLS:

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

`UwsInstanceAdapter` accepts:

- a port number, for example `adapter.listen(8079)`
- or an object with `port`, optional `host`, optional `path`, optional `ssl`,
  optional `appOptions`, and optional partial uWS websocket `behavior`

## uWS Node Support

`uWebSockets.js` is a native package distributed from GitHub, not the npm
registry. It ships `.node` binaries for selected Node/V8 ABI versions.

The nengi adapter lazy-loads `uWebSockets.js`. If the active Node version is not
supported by the installed uWS release, the adapter should throw an error that
includes:

- the active Node version, such as `v24.13.1`
- the Node modules ABI, such as `137`
- the underlying missing native binary, such as `uws_linux_x64_137.node`

When this happens:

1. Check `node -p "process.version + ' abi=' + process.versions.modules"`.
2. Check the installed uWS package for matching native binaries:
   `ls node_modules/uWebSockets.js | grep uws_linux_x64`.
3. Prefer an even/LTS Node version supported by the installed uWS release.
4. If the project needs a newer Node major, update the GitHub uWS tag and
   retest.

In this R&D workspace, `nengi-uws-instance-adapter` currently pins
`uWebSockets.js#v20.66.0` because it includes Linux x64 binaries for:

- Node 20 ABI `115`
- Node 22 ABI `127`
- Node 24 ABI `137`

Do not assume the latest uWS tag supports the widest Node range. For example,
newer tags may drop older ABIs while adding newer ones. Verify the actual
binary files before changing the pinned tag.

## Node Bot Client

```ts
import { Client } from 'nengi'
import { WsClientAdapter } from 'nengi-ws-client-adapter'

const client = new Client(context, WsClientAdapter, serverTickRate)
await client.connect('ws://localhost:8079', { role: 'bot' })
```

Use this for bot benchmarks, admin tools, test clients, and Node-only tooling.

## Test And Local Modes

Use `LocalInstanceAdapter` and `LocalClientAdapter` from core for deterministic
tests, single-player modes, and embedded simulations. These are dependency-free
in-memory transports, not socket libraries.

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

This still exercises the handshake, command, request, snapshot, and binary
reader/writer paths. Use it when a real socket would add noise without changing
the behavior under test. Browser-hosted local prototypes should usually use
`nengi-dataviews`; Node-only tests can use `nengi-buffers` or an internal test
binary adapter.

## Binary Backends

Use `nengi-dataviews` when the transport naturally delivers `ArrayBuffer` or
typed-array payloads, usually browser WebSocket clients and browser-hosted
experiments.

Use `nengi-buffers` when the transport naturally delivers Node `Buffer` payloads,
usually `ws`, uWS, bots, and Node tools.

The core binary contract is `BinaryAdapter<InboundPayload, OutboundPayload>`.
Adapter packages should translate their transport payload into the binary
backend at the edge, then keep the rest of nengi unaware of transport-specific
types.

## Adapter Implementation Rules

For a server adapter:

- expose `binary`
- create `User` objects on accepted sockets
- call `instance.network.onOpen(user)`
- call `instance.network.onMessage(user, payload)` with the raw binary payload
- call `instance.network.onClose(user)` on close
- implement `send(user, payload)`
- implement `disconnect(user, reason)`

For a client adapter:

- expose `binary`
- implement `connect(target, handshake)`
- send `client.network.createHandshake(handshake, binary)` after opening
- read the handshake response before treating normal snapshots as game data
- implement `flush()` by sending `client.network.createOutbound(binary)`
- call `client.network.readSnapshot(binary.createReader(payload))` for inbound
  snapshots
- call `client.network.onDisconnect(...)` and `client.network.onSocketError(...)`
  when appropriate

Core should not assume TCP, WebSocket, uWS, UDP, Node `Buffer`, browser
`ArrayBuffer`, or any specific transport target.
