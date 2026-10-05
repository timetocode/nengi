# Canonical snippets

These snippets are for AI agents that need to see the shape of a complete
nengi flow without relying on another project. They are intentionally small. Use
them to orient server/client wiring, then keep the actual game code shaped by
the game's model.

For a complete runnable application, use [getting started](./getting-started.md).
These are topic fragments with game-owned helpers, not standalone files:

- [plain-channels.md](./plain-channels.md) for ordinary replicated objects
- [ecs-channels.md](./ecs-channels.md) for nengi ECS channels
- [networking-primitives.md](./networking-primitives.md#connection-handshake) for
  auth/session data passed during connection
- [realtime-movement-prediction.md](./realtime-movement-prediction.md) for fast
  local movement prediction

## Connection setup

Use the handshake for server authorization and session selection. Omit the
second `connect` argument when the game has no connection setup data. When a
handshake payload is present, validate it before accepting. Return `serverData`
for local context on `NetworkEvent.UserConnected` and optional public `clientData`
for the client's `connect()` result. Replicated gameplay state still arrives in
snapshots after acceptance.

```ts
// client
await client.connect('ws://localhost:8079', {
    token,
    characterId,
    clientBuild: BUILD_ID
})
```

```ts
// server
instance.onConnect = async (handshake, { signal }) => {
    const session = await verifySessionToken(handshake.token, { signal })
    signal.throwIfAborted()
    if (!session) {
        return false
    }
    return {
        serverData: {
            accountId: session.accountId,
            characterId: handshake.characterId,
            isAdmin: session.roles.includes('admin')
        }
    }
}
```

Return `true` when no setup data is needed, or `false` to deny. Only `clientData`
is serialized; omitting it makes `connect()` resolve with `undefined`.
The application helper must support the signal to cancel its I/O. When setup
reserves resources, follow [setup ownership](./networking-primitives.md#cancellation-and-setup-ownership)
so failure after the handler returns also releases them.

## Plain spatial server and client

This is the common non-ECS shape: ordinary network entities in a spatial
channel, commands for input, and raw frame facts on the client.

```ts
// shared/protocol.ts
import { Binary, defineEntitySchema, defineMessageSchema } from 'nengi'

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

export const PlayerSchema = defineEntitySchema({
    x: { type: Binary.Float32, interp: true },
    y: { type: Binary.Float32, interp: true }
})

export const MoveCommandSchema = defineMessageSchema({
    inputX: Binary.Int8,
    inputY: Binary.Int8
})

export const YouArePlayerSchema = defineMessageSchema({
    nid: Binary.UInt32
})
```

```ts
// server/main.ts
import { Channel2D, CommandRouter, Instance, NetworkEvent, UserConnectionState } from 'nengi'
import type { User } from 'nengi'

const instance = new Instance(context)
const world = new Channel2D(instance.localState, 64, { name: 'world' })
const commands = new CommandRouter()
const playersByUser = new Map<number, PlayerEntity>()

function viewFor(player: PlayerEntity) {
    return { x: player.x, y: player.y, halfWidth: 700, halfHeight: 500 }
}

function spawnPlayer(user: User) {
    const player = createPlayer()
    world.addEntity(player)
    world.subscribe(user, viewFor(player))
    playersByUser.set(user.id, player)
    user.queueMessage({ ntype: NType.YouArePlayer, nid: player.nid })
}

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const player = playersByUser.get(user.id)
    if (!player) {
        return
    }

    applyMoveStep(player, command)
    world.moveEntity(player)
    world.updateView(user, viewFor(player))
})

function tick() {
    while (!instance.queue.isEmpty()) {
        const event = instance.queue.next()
        if (event.type === NetworkEvent.UserConnected) {
            if (event.user.connectionState === UserConnectionState.Open) spawnPlayer(event.user)
        } else if (event.type === NetworkEvent.UserDisconnected) {
            const player = playersByUser.get(event.user.id)
            if (player) {
                world.removeEntity(player)
            }
            playersByUser.delete(event.user.id)
        } else {
            commands.process(event)
        }
    }

    instance.processRequests()
    instance.step()
}
```

Use the [plain client handler and render loop](./plain-channels.md#canonical-small-client)
for channel routing, lifecycle cleanup, and interpolation. That is the maintained
client implementation for this flow.

## ECS spatial server and client

Use this shape when roots are ECS entities and networked state lives on
components. The server binding keeps ECS root lifecycle and channel lifecycle
paired while local-only components remain ordinary world state.

```ts
// server/main.ts
import { bindEcsChannel, CommandRouter, EcsChannel2D, EcsWorld, Instance, NetworkEvent, ecs } from 'nengi'

const instance = new Instance(context)
const world = new EcsWorld()
const worldChannel = new EcsChannel2D(instance.localState, 64, { name: 'world' })
const replicated = bindEcsChannel(world, worldChannel, { context })
const commands = new CommandRouter()

const Transform = ecs.defineComponent<TransformComponent>(NType.Transform, 'Transform')
const TransformNet = replicated.component(Transform)

const playerPidByUser = new Map<number, number>()

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const pid = playerPidByUser.get(user.id)
    if (pid === undefined) {
        return
    }

    const transform = world.require(pid, Transform)
    applyMoveStep(transform, command)
    TransformNet.writer.props.x(transform, transform.x)
    TransformNet.writer.props.y(transform, transform.y)
    worldChannel.updateView(user, viewFor(transform))
})
```

Use the [ECS client handler](./ecs-channels.md#canonical-small-client) for
channel routing, ECS application, and resource cleanup.

## Predicted movement loop

The client code below uses `client`, `controlledNid`, `applyNetworkFrame`, and
`render` from the [plain client](./plain-channels.md#canonical-small-client),
plus game-owned prediction state and input.
Replace its basic animation loop with the prediction loop shown here. This
variant extends the shared `MoveCommand` type and schema with `dtMs: number` /
`Binary.Float64`; both peers use that same schema. `MoveState` contains `x` and
`y`, matching the player schema above.

For fast local movement, the server and client must share the deterministic part
of player-authored movement. If the server resolves wall collision while
processing a command, the client prediction replay should use the same resolver.

```ts
// shared/movement.ts
// MoveCommand carries dtMs from the originating client render frame.

export function applyPredictedMove(state: MoveState, command: MoveCommand) {
    applyMoveStep(state, command) // Uses command.dtMs on both sides.
    resolvePlayerWallCollision(state)
}
```

```ts
// server command handler
commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const player = playersByUser.get(user.id)
    if (!player) {
        return
    }

    if (!validateInput(command) || !consumeInputTime(player, command.dtMs)) return
    applyPredictedMove(player, command)
    checkPickupsAndTriggers(user, player)
    world.moveEntity(player)
    world.updateView(user, viewFor(player))
})
```

```ts
// client prediction
import { CommandReplayPrediction } from 'nengi'

const movementPrediction = new CommandReplayPrediction({
    client,
    nid: () => controlledNid || undefined,
    getLocal: () => predictedPlayer,
    createReplayState: authority => ({
        x: authority.x,
        y: authority.y
    }),
    applyCommand: (state, command) => applyPredictedMove(state, command),
    applyReplayState: (local, replayState) => Object.assign(local, replayState),
    affectedProps: ['x', 'y']
})

function renderFrame(dtMs: number) {
    if (client.connectionState !== 'connected') return
    let frame
    while ((frame = client.network.processNextFrame())) {
        applyNetworkFrame(frame)
        movementPrediction.reconcile()
    }

    if (document.hidden || dtMs > 100) {
        clearHeldInput()
    } else if (dtMs > 0) {
        movementPrediction.predict({ ...readMoveCommand(), dtMs })
    }

    renderLocalPlayer(predictedPlayer)
    render(controlledNid) // The local player was rendered from prediction above.
    client.flush()
}
```

Do not put a custom sequence number in the command payload. Nengi records command
ordering with `commandFrameNumber`. For this prediction loop, the server must
explicitly confirm completed input before its snapshot; use the
[prediction server loop](./realtime-movement-prediction.md#shared-command-simulation).

Here `dtMs` is milliseconds and `clearHeldInput()` clears application-owned input.
The 100 ms cutoff discards input time after a stall. Clear input and reset the
render clock on visibility changes too; keep essential frame handling separate
from rendering while hidden. See the
[client loop and pause policy](./realtime-movement-prediction.md#client-loop).
