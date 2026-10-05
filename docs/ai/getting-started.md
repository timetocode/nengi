# Getting started

Build a small shared room before choosing a larger game architecture. The
maintained [starter](../../examples/basic-movement/README.md) is a complete
TypeScript project included in the npm package. It has a Node WebSocket server,
a browser client, schemas, validated click-to-move input, adaptive interpolation,
and disconnect/reconnect handling. It uses no prediction or command confirmation.

## Run it

Use Node 22.12 or newer. In an empty directory:

```sh
npm init -y
npm install nengi@2.0.0-rc.128
node -e "require('node:fs').cpSync('node_modules/nengi/examples/basic-movement', '.', { recursive: true })"
npm install
npm run dev
```

Copying the starter replaces the empty project's `package.json`; do not run the
copy command in an existing game. For an unpublished development build, use the
local-candidate instructions below.

Open the URL printed by Vite in two browser tabs. Connect both. Each tab should
show two players; click the room to move your own player. Disconnect one tab and
its player disappears in the other. Connect again to start a fresh session.

`npm run build` checks the complete project against the installed declarations
and builds browser assets. `npm run dev` supplies the local WebSocket proxy.
Production hosting needs a running game-server process and HTTP/WebSocket
routing; uploading `dist` alone does not start the game server. Use
[adapters](./adapters.md) and [operations](./operations.md) when deploying.

## Using a local candidate

In the first install command, substitute the core tarball for
`nengi@2.0.0-rc.128`. Perform the same copy step. Then replace the final
`npm install` with an installation of the matching candidate artifacts:

```sh
npm install /path/to/nengi-2.0.0-rc.128.tgz /path/to/nengi-buffers-2.0.0-rc.128.tgz /path/to/nengi-dataviews-2.0.0-rc.128.tgz /path/to/nengi-ws-instance-adapter-2.0.0-rc.128.tgz /path/to/nengi-websocket-client-adapter-2.0.0-rc.128.tgz
```

Use the actual filenames supplied with your candidate. This installs the
starter's development tools too, and records local dependencies in its own
manifest. Installing all five artifacts together avoids resolving unpublished
transport or binary packages from npm. Their version numbers can differ when
their declared ranges are compatible; see [package compatibility](./package-compatibility.md).

## Read the running project

| File | Responsibility |
| --- | --- |
| [protocol.ts](../../examples/basic-movement/protocol.ts) | Shared entity/input types, schemas, registrations and snapshot frequency. |
| [game.ts](../../examples/basic-movement/game.ts) | Connection lifecycle, input validation, authoritative movement and snapshots. |
| [server.ts](../../examples/basic-movement/server.ts) | Listener, server timer and shutdown. |
| [client-state.ts](../../examples/basic-movement/client-state.ts) | Ordered frame facts, owned presentation records and interpolation. |
| [client.ts](../../examples/basic-movement/client.ts) | Connection UI, click commands and DOM rendering. |
| [dev.ts](../../examples/basic-movement/dev.ts) | Local HTTP server and WebSocket proxy. |

The server moves toward a destination at its own tick rate. The client displays
all players from interpolated authoritative history, including its own player.
That gives this starter visible input latency. It is a deliberate simple model
for learning replication or making a slower interaction game.

For sharp direct controls, choose the [action movement model](./realtime-movement-prediction.md):
apply input locally immediately, send its duration, apply the same movement in
server command processing, and reconcile pending inputs. Add prediction only
when you need that behavior; ordinary commands do not require confirmation.

## Grow it deliberately

- Keep `Channel` while everyone in the room sees everyone else. For local
  visibility, follow the [spatial adaptation](./minimal-spatial-game.md).
- Keep the TypeScript state and its [schema](./shared-state.md) together. The
  [networking primitives](./networking-primitives.md) guide distinguishes durable
  state, transient messages, ordered input and requests.
- Replace DOM rendering with your renderer of choice. Continue treating received
  state as read-only and own your mutable presentation values.
- Use [ECS channels](./ecs-channels.md) when the game's model benefits from roots
  and components. Manual writes are a further choice with explicit obligations.
- Preserve the lifecycle handling when changing the UI: drain frames in order,
  release presentation on disconnect, and create a new session after closure.

The other manual snippets omit application-specific helpers to keep each topic
focused. This starter is the complete copy-and-run application.
