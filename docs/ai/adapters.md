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

For this release candidate, the package version is `2.0.0-rc.124`:

```text
nengi@2.0.0-rc.124
nengi-websocket-client-adapter@2.0.0-rc.124
nengi-ws-client-adapter@2.0.0-rc.124
nengi-ws-instance-adapter@2.0.0-rc.124
nengi-uws-instance-adapter@2.0.0-rc.124
nengi-dataviews@2.0.0-rc.124
nengi-buffers@2.0.0-rc.124
```

When the core version changes, change every installed official package to that
same version. Do not mix an older adapter with a newer core, even when the
package manager accepts the dependency graph. Matching versions protect both
the binary protocol contract and TypeScript's private type identities.

Verify the installed graph with:

```bash
npm ls nengi nengi-dataviews nengi-buffers \
    nengi-websocket-client-adapter nengi-ws-client-adapter \
    nengi-ws-instance-adapter nengi-uws-instance-adapter
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
| `nengi-dataviews` | Browser/DataView binary backend |
| `nengi-buffers` | Node Buffer binary backend |

Client and server adapters are not interchangeable. Binary backends are chosen
from the payload type available at the transport boundary.

## Browser Client

Install the core, browser WebSocket adapter, and browser binary backend at the
same version:

```bash
npm install nengi@2.0.0-rc.124 \
    nengi-websocket-client-adapter@2.0.0-rc.124 \
    nengi-dataviews@2.0.0-rc.124
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
npm install nengi@2.0.0-rc.124 \
    nengi-ws-instance-adapter@2.0.0-rc.124 \
    nengi-buffers@2.0.0-rc.124
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
npm install nengi@2.0.0-rc.124 \
    nengi-uws-instance-adapter@2.0.0-rc.124 \
    nengi-buffers@2.0.0-rc.124
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

## Node Client

Install the core, Node client adapter, and Node binary backend at one version:

```bash
npm install nengi@2.0.0-rc.124 \
    nengi-ws-client-adapter@2.0.0-rc.124 \
    nengi-buffers@2.0.0-rc.124
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

A client adapter must:

- expose `binary`
- implement `connect(target, handshake = {})`
- send the handshake through nengi after opening
- implement `flush()` with `client.network.createOutbound(binary)`
- pass inbound payloads to `client.network.readSnapshot(...)`
- call the client network disconnect and socket-error hooks appropriately

Core game code should import only from the package root. Deep imports into
`nengi/src` or `nengi/build` are not part of the package contract.
