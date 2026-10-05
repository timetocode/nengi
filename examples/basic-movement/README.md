# Shared room starter

A complete TypeScript browser/Node application. Connect in two tabs, click to
move, disconnect, and connect again. The server owns movement; adaptive
interpolation renders every player, including the player you control.

Use Node 22.12 or newer. From a copy of this directory:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` checks TypeScript and builds
the browser files into `dist`. This starts a local development application;
Vite proxies `/game` to the ws server on its assigned port. Production hosting
needs a game-server process and an HTTP/WebSocket route appropriate to your host.
For an unpublished local candidate, install its core, transport and binary
tarballs together instead of the registry pins.

Read the files in this order:

1. `protocol.ts`: shared types, schemas, context and snapshot frequency.
2. `game.ts`: lifecycle/input events, validated destinations, movement, snapshot.
3. `server.ts`: WebSocket listener, tick timer and shutdown.
4. `client-state.ts`: ordered frame facts and independent presentation objects.
5. `client.ts`: connection UI, click input, interpolation and DOM rendering.
6. `dev.ts`: local HTTP server and WebSocket proxy.

The server advances toward the most recent destination once per server tick.
There is no client movement prediction and no confirmation code to maintain.
Network round-trip and interpolation delay are visible in the control response.
This is a useful model for learning replication or making a slower interaction
game. For direct-control action games, use the manual's command replay model
with immediate local movement and explicit completed-command confirmation.

The small room uses `Channel`: everyone subscribes to the same state. Choose a
spatial channel when visibility actually depends on position. Received entities
are treated as read-only; the client copies primitive fields into presentation.
Background tabs drain frames, and a disconnected session releases presentation.
Reconnecting creates a new Client and interpolator.

The complete manual is installed at `node_modules/nengi/docs/ai/README.md`.
When putting the copied project in Git, ignore `node_modules` and `dist`.
