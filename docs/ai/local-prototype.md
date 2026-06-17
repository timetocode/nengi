# Local Prototype Scaffold

Use this guide when creating a new browser game prototype inside this R&D
workspace. The goal is to let the game come from the docs, not from copying an
existing complex example.

## Environment

- Use TypeScript.
- Use Node 24 if available.
- Use Vite for the browser client.
- Use `tsx` for the Node server during development.
- Create the game under `examples/<game-name>`.
- Do not install `nengi` from npm in this workspace. Use local `file:`
  dependencies or the `#nengi` shim shown below.

Before creating files, verify that the shell you are using can actually run
Node and npm. This matters when an AI is launched from Windows but edits a WSL2
folder.

```bash
pwd
node -v
npm -v
```

If the shell is Windows PowerShell pointed at a WSL2 path such as
`\\wsl$\Ubuntu\home\neuron\nengi-all`, Node/npm may be available only through
interactive WSL because nvm is loaded by interactive bash startup files. Retry
the preflight with the explicit WSL command below. Do not switch the whole Codex
environment to WSL2 just to access Node/npm; that can make replies extremely
slow.

```powershell
wsl -d Ubuntu -- bash -ic "cd /home/neuron/nengi-all && pwd && node -v && npm -v && which node && which npm"
```

Use `bash -ic` exactly. Do not use `bash -lc`, `bash -c`, PowerShell `npm`, or
the UNC path as the command working directory for Node/npm commands. Project
commands should `cd` to Linux paths under `/home/neuron/nengi-all`.

Run later commands through the same pattern if direct PowerShell commands cannot
see npm:

```powershell
wsl -d Ubuntu -- bash -ic "cd /home/neuron/nengi-all/examples/my-game && npm install"
wsl -d Ubuntu -- bash -ic "cd /home/neuron/nengi-all/examples/my-game && npm run typecheck"
wsl -d Ubuntu -- bash -ic "cd /home/neuron/nengi-all/examples/my-game && npm run dev"
```

If commands fail with a sandbox/tool setup error such as
`windows sandbox: helper_unknown_error: setup refresh had errors`, treat that as
a Codex tool-execution problem, not as proof that Node/npm or the project are
missing. If the Codex UI supports escalation/approval for shell commands,
request escalation and rerun the same explicit `wsl -d Ubuntu -- bash -ic "..."`
command. If escalation is unavailable or still fails, continue by reading the
docs and creating the example if file editing still works. Create `AI_NOTES.md`
early and record the exact sandbox error under environment notes. Skip runtime
verification until command execution works.

Only stop before implementation if both command execution and file editing are
unavailable. If shell commands are unavailable but files can be edited, proceed
with implementation and clearly mark install/typecheck/dev verification as
blocked in `AI_NOTES.md`.

When using official adapter packages, do not mix `../../../nengi/src` imports
with adapter packages that import `nengi` from the built package. Use one nengi
import universe. The recommended local prototype path is:

- `nengi` imported through the local package dependency.
- official adapter packages imported through local `file:` dependencies.
- `shared/nengi.ts` re-exporting from `'nengi'`.

Run `npm run rebuild:local` before verification if local package builds may be
stale.

## Recommended Files

Start with this shape:

```text
examples/my-game/
  client/
    index.html
    main.ts
    style.css
  server/
    index.ts
  shared/
    context.ts
    nengi.ts
    schema.ts
  package.json
  tsconfig.json
  vite.config.ts
  AI_NOTES.md
```

`AI_NOTES.md` is for the AI building the prototype. It should record decisions,
friction, missing docs, API surprises, and anything that felt good or awkward.

## package.json

Use local dependencies while nengi is still in R&D:

```json
{
  "name": "nengi-example-my-game",
  "private": true,
  "type": "module",
  "imports": {
    "#nengi": "./shared/nengi.ts"
  },
  "scripts": {
    "dev": "npm-run-all --parallel dev:server dev:client",
    "dev:fresh": "npm run rebuild:local && npm run dev",
    "dev:server": "tsx server/index.ts",
    "dev:client": "vite --config vite.config.ts",
    "rebuild:local": "npm --prefix ../../nengi run build && npm --prefix ../../nengi-buffers run build && npm --prefix ../../nengi-dataviews run build && npm --prefix ../../nengi-ws-instance-adapter run build && npm --prefix ../../nengi-websocket-client-adapter run build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "nengi": "file:../../nengi",
    "nengi-ws-instance-adapter": "file:../../nengi-ws-instance-adapter",
    "nengi-websocket-client-adapter": "file:../../nengi-websocket-client-adapter"
  },
  "devDependencies": {
    "@types/node": "^20.19.0",
    "npm-run-all": "^4.1.5",
    "tsx": "^4.22.4",
    "typescript": "^5.9.3",
    "vite": "^8.0.16"
  }
}
```

Use the `ws` adapter for first prototypes because it works on ordinary Node
versions. Use the uWS adapter later for performance-specific testing.

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "baseUrl": ".",
    "paths": {
      "#nengi": ["shared/nengi.ts"]
    },
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": [
    "client/**/*",
    "server/**/*",
    "shared/**/*"
  ]
}
```

## vite.config.ts

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
    root: 'client',
    server: {
        host: '0.0.0.0',
        port: 5173
    },
    resolve: {
        alias: {
            '#nengi': fileURLToPath(new URL('shared/nengi.ts', import.meta.url))
        }
    },
    optimizeDeps: {
        include: ['nengi', 'nengi-websocket-client-adapter']
    }
})
```

Do not exclude `nengi` from Vite dependency optimization when importing the
local built package. The local package currently builds to CommonJS, and Vite
needs to prebundle it so browser code can safely use named imports from the
`shared/nengi.ts` shim.

## shared/nengi.ts

Use a local shim so game code has one stable import path. When using official
adapter packages, re-export from package `nengi`, not from `../../../nengi/src`.
This keeps core types aligned with adapter package types.

```ts
export {
    AdaptiveInterpolator,
    Binary,
    Channel,
    Client,
    ClientEntityMode,
    ClientReplica,
    CommandRouter,
    Context,
    Instance,
    NetworkEvent,
    SpatialChannel2D,
    StaticInterpolator,
    User,
    defineEntitySchema,
    defineMessageSchema
} from 'nengi'
```

Add more exports only when the prototype actually uses them.

## shared/schema.ts

Keep the first schema small:

```ts
export enum NType {
    Player = 1,
    MoveCommand = 2,
    YouArePlayer = 3
}

export type PlayerEntity = {
    nid: number
    ntype: NType.Player
    x: number
    y: number
}

export type MoveCommand = {
    ntype: NType.MoveCommand
    inputX: number
    inputY: number
}

export type YouArePlayerMessage = {
    ntype: NType.YouArePlayer
    nid: number
}
```

## shared/context.ts

```ts
import { Binary, Context, defineEntitySchema, defineMessageSchema } from '#nengi'
import { NType } from './schema'

export function createGameContext() {
    const context = new Context()

    context.register(NType.Player, defineEntitySchema({
        x: Binary.Float32,
        y: Binary.Float32
    }))

    context.register(NType.MoveCommand, defineMessageSchema({
        inputX: Binary.Int8,
        inputY: Binary.Int8
    }))

    context.register(NType.YouArePlayer, defineMessageSchema({
        nid: Binary.UInt32
    }))

    return context
}
```

## Server Shape

For a minimal spatial game, use:

- `Instance`
- `WsInstanceAdapter`
- `SpatialChannel2D`
- `CommandRouter`
- one `Player` entity per connected user

For a tiny shared arena where every connected user should see every entity, use
`Channel` instead of `SpatialChannel2D`.

Server startup imports normally look like this:

```ts
import { CommandRouter, Instance, NetworkEvent, SpatialChannel2D, User } from '#nengi'
import { WsInstanceAdapter } from 'nengi-ws-instance-adapter'
import { createGameContext } from '../shared/context'
```

Create the instance and adapter:

```ts
const SERVER_TICK_RATE = 20
const PORT = 8079

const context = createGameContext()
const instance = new Instance(context)
const adapter = new WsInstanceAdapter(instance.network)

instance.onConnect = async () => true
adapter.listen(PORT, () => {
    console.log(`server listening on ws://localhost:${PORT}`)
})
```

Call `world.updateEntity(player)` after a spatial entity moves so the spatial
grid can update its cell bookkeeping. Call `world.updateView(user, view)` when
the user's interest area moves.

For automatic `Channel` and `SpatialChannel2D`, ordinary replicated property
changes are diffed during snapshot construction. `markDirty(entity)` is not
required for correctness on the automatic path. Use explicit mutation APIs and
manual channels only when the game is deliberately taking responsibility for
reported mutations.

The server loop should:

1. Process queued nengi events.
2. Handle connects/disconnects.
3. Process commands.
4. Step the instance.

## Client Shape

For a minimal browser game, use:

- `Client`
- `WebSocketClientAdapter`
- `ClientReplica`
- `AdaptiveInterpolator` or `StaticInterpolator`
- canvas, Pixi, or another renderer

Client startup imports normally look like this:

```ts
import { AdaptiveInterpolator, Client, ClientEntityMode, ClientReplica } from '#nengi'
import { WebSocketClientAdapter } from 'nengi-websocket-client-adapter'
import { createGameContext } from '../shared/context'
```

Create the client and replica:

```ts
const SERVER_TICK_RATE = 20
const context = createGameContext()
const client = new Client(context, WebSocketClientAdapter, SERVER_TICK_RATE)
const interpolator = new AdaptiveInterpolator(client)
const replica = new ClientReplica(client, { interpolator })

await client.connect('ws://localhost:8079', { name: 'player' })
```

Keep the first client simple:

1. Connect to the server.
2. Register CRUD handlers with `ClientReplica`.
3. Track remote entities as interpolated.
4. Mark the local player as predicted or raw if the server sends
   `YouArePlayer`.
5. Each animation frame, process server frames, sample interpolation, draw, send
   movement commands, and flush.

## Install And Run

From the new example directory:

```bash
npm install
npm run typecheck
npm run dev
```

If the adapter packages fail because their local builds are stale, run:

```bash
npm run rebuild:local
npm run typecheck
npm run dev
```

## What Not To Do In The First Prototype

- Do not copy `examples/player-arena`; it is a stress lab with many experimental
  systems.
- Do not start with prediction, inventories, ECS, historian lag compensation, or
  manual mutation channels unless the prompt specifically asks for them.
- Do not use a spatial channel only because it sounds faster. Use it when the
  world model is spatial and players have local views.
- Do not use request/response for movement input.
- Do not publish packages to npm for local R&D prototypes.
