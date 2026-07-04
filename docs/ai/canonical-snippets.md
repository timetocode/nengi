# Canonical snippets

These snippets are for AI agents that need to see the shape of a complete
nengi flow without reading an example game. They are intentionally small. Use
them to orient server/client wiring, then keep the actual game code shaped by
the game's model.

Do not treat this file as a game template. Prefer the topic documents when you
need detail:

- [plain-channels.md](./plain-channels.md) for ordinary replicated objects
- [ecs-channels.md](./ecs-channels.md) for nengi ECS channels
- [networking-primitives.md](./networking-primitives.md#connection-handshake) for
  auth/session data passed during connection
- [realtime-movement-prediction.md](./realtime-movement-prediction.md) for fast
  local movement prediction

## Connection setup

Use the handshake for server authorization and session selection. Omit the
second `connect` argument when the game has no connection setup data. When a
handshake payload is present, the returned payload is server-side context for
`NetworkEvent.UserConnected`; client bootstrap still uses normal messages,
channel headers, or replicated state.

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
instance.onConnect = async handshake => {
    const session = await verifySessionToken(handshake.token)
    if (!session) {
        return false
    }
    return {
        accountId: session.accountId,
        characterId: handshake.characterId,
        isAdmin: session.roles.includes('admin')
    }
}
```

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
import { Channel2D, CommandRouter, Instance, NetworkEvent, User } from 'nengi'

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
            spawnPlayer(event.user)
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

    instance.step()
}
```

```ts
// client/main.ts
import { AdaptiveInterpolator, Client } from 'nengi'
import type { Frame } from 'nengi'

const client = new Client(context, WebSocketClientAdapter, 20)
const interpolator = new AdaptiveInterpolator(client)
const channelByName = new Map<string, number>()
const sprites = new Map<number, Sprite>()
let controlledNid = 0

function applyFrame(frame: Frame) {
    frame.openedChannels.forEach(channel => {
        if (channel.header.name === 'world') {
            channelByName.set('world', channel.channelId)
        }
    })

    frame.messages.forEach(message => {
        if (message.ntype === NType.YouArePlayer) {
            controlledNid = message.nid
        }
    })

    const worldId = channelByName.get('world')
    const worldFrame = worldId === undefined ? undefined : frame.getChannel(worldId)
    if (worldFrame) {
        worldFrame.createEntities.forEach(entity => {
            if (entity.ntype === NType.Player) {
                sprites.set(entity.nid, createPlayerSprite(entity as PlayerEntity))
            }
        })

        worldFrame.deletedEntities.forEach(deleted => {
            sprites.get(deleted.nid)?.destroy()
            sprites.delete(deleted.nid)
        })
    }

    frame.closedChannels.forEach(channel => {
        if (channel.channelId === worldId) {
            channel.entityNids.forEach(nid => {
                sprites.get(nid)?.destroy()
                sprites.delete(nid)
            })
            channelByName.delete('world')
        }
    })
}

function renderRemotePlayers() {
    const remoteNids = Array.from(sprites.keys()).filter(nid => nid !== controlledNid)
    const sample = interpolator.sampleEntities(remoteNids, 100)
    sample.entities.forEach(entity => {
        placeSprite(sprites.get(entity.nid), entity)
    })
}
```

## ECS spatial server and client

Use this shape when roots are ECS entities and networked state lives on
components.

```ts
// server/main.ts
import { CommandRouter, EcsChannel2D, EcsWorld, Instance, NetworkEvent, ecs } from 'nengi'

const instance = new Instance(context)
const world = new EcsWorld()
const worldChannel = new EcsChannel2D(instance.localState, 64, { name: 'world' })
const commands = new CommandRouter()

const Transform = ecs.defineComponent<TransformComponent>(NType.Transform, 'Transform')
const transformWriter = worldChannel.createComponentWriter(
    NType.Transform,
    context.getSchema(NType.Transform)!
)

const playerPidByUser = new Map<number, number>()

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const pid = playerPidByUser.get(user.id)
    if (pid === undefined) {
        return
    }

    const transform = world.require(pid, Transform)
    applyMoveStep(transform, command)
    transformWriter.props.x(transform, transform.x)
    transformWriter.props.y(transform, transform.y)
    worldChannel.updateView(user, viewFor(transform))
})
```

```ts
// client/main.ts
import { Client, EcsWorld, applyEcsChannelClose, applyEcsChannelFrame, ecs } from 'nengi'
import type { Frame } from 'nengi'

const client = new Client(context, WebSocketClientAdapter, 20)
const world = new EcsWorld()
const channelByName = new Map<string, number>()

const Transform = ecs.defineComponent<TransformComponent>(NType.Transform, 'Transform')

function applyFrame(frame: Frame) {
    frame.openedChannels.forEach(channel => {
        if (channel.header.name === 'world') {
            channelByName.set('world', channel.channelId)
        }
    })

    const worldId = channelByName.get('world')
    frame.channels.forEach(channelFrame => {
        if (channelFrame.channelId === worldId) {
            applyEcsChannelFrame(world, channelFrame, {
                beforeRemoveEntity(pid) {
                    destroySpriteForPid(pid)
                }
            })
        }
    })

    frame.closedChannels.forEach(channel => {
        if (channel.channelId === worldId) {
            applyEcsChannelClose(world, channel, {
                beforeRemoveEntity(pid) {
                    destroySpriteForPid(pid)
                }
            })
            channelByName.delete('world')
        }
    })
}

function render() {
    world.query(Transform).all((pid, transform) => {
        placeSpriteForPid(transform.pid, transform)
    })
}
```

## Predicted movement loop

For fast local movement, the server and client must share the deterministic part
of player-authored movement. If the server resolves wall collision while
processing a command, the client prediction replay should use the same resolver.

```ts
// shared/movement.ts
export const COMMAND_RATE = 30
export const COMMAND_DT = 1 / COMMAND_RATE

export function applyPredictedMove(state: MoveState, command: MoveCommand) {
    applyMoveStep(state, command)
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
        y: authority.y,
        vx: authority.vx,
        vy: authority.vy
    }),
    applyCommand: (state, command) => applyPredictedMove(state, command),
    applyReplayState: (local, replayState) => Object.assign(local, replayState),
    affectedProps: ['x', 'y', 'vx', 'vy']
})

function renderFrame(dt: number) {
    for (const frame of client.network.drainFrames()) {
        applyFrame(frame)
    }

    movementPrediction.reconcile()

    commandAccumulator += Math.min(dt, 0.12)
    while (commandAccumulator >= COMMAND_DT) {
        commandAccumulator -= COMMAND_DT
        movementPrediction.predict(readMoveCommand())
    }

    renderLocalPlayer(predictedPlayer)
    renderRemotePlayers()
    client.flush()
}
```

Do not put a custom sequence number in the command payload. Nengi records command
ordering with `commandFrameNumber` and confirms it through snapshots.
