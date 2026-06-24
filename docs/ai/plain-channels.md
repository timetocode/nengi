# Plain object channels

This is the canonical small non-ECS shape. Use it when game objects are ordinary
network entities with `nid`, `ntype`, and schema properties. The server owns
those objects directly, and the client reads nengi's raw `EntityStore` plus
per-frame channel facts.

For a 2D world where visibility depends on position, use `Channel2D`. For a
small arena where every subscribed user sees every object, use `Channel` with
the same client shape.

Define each replicated entity type beside its nengi schema and create function.
See [shared-state.md](./shared-state.md) for the recommended file shape. For
plain channels, the replicated object is the network entity: it has `nid`,
`ntype`, schema properties, and a registered nengi schema.

## Canonical small server

Assume `NType`, schemas, and factory functions such as `createPlayer` and
`createContext` are defined by the game.

```ts
import {
    Channel2D,
    CommandRouter,
    Instance,
    NetworkEvent,
    User
} from 'nengi'

const context = createContext()
const instance = new Instance(context)
const world = new Channel2D(instance.localState, 100, { name: 'world' })

const playerByUser = new Map<number, PlayerEntity>()
const commands = new CommandRouter()

function viewFor(player: PlayerEntity) {
    return { x: player.x, y: player.y, halfWidth: 800, halfHeight: 600 }
}

function spawnPlayer(user: User) {
    const player = createPlayer(100, 100)
    world.addEntity(player)
    world.subscribe(user, viewFor(player))
    playerByUser.set(user.id, player)

    user.queueMessage({
        ntype: NType.YouArePlayer,
        nid: player.nid
    })
}

function removePlayer(user: User) {
    const player = playerByUser.get(user.id)
    if (!player) {
        return
    }

    playerByUser.delete(user.id)
    world.removeEntity(player)
}

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const player = playerByUser.get(user.id)
    if (!player) {
        return
    }

    player.x += command.inputX * 10
    player.y += command.inputY * 10

    // Automatic spatial channels still need to learn when an entity moves so
    // nengi can update cell membership and visibility.
    world.moveEntity(player)
    world.updateView(user, viewFor(player))
})

function tick() {
    while (!instance.queue.isEmpty()) {
        const event = instance.queue.next()
        if (event.type === NetworkEvent.UserConnected) {
            spawnPlayer(event.user)
        } else if (event.type === NetworkEvent.UserDisconnected) {
            removePlayer(event.user)
        } else {
            commands.process(event)
        }
    }

    instance.step()
}
```

The server object is the network object. Mutating `player.x` and `player.y`
changes authoritative state. Nengi's automatic channel diffing sends schema
property changes; `moveEntity` handles spatial membership.

If the game uses `ManualChannel2D` instead, keep the same object model but call
manual writers at every networked mutation point.

## Canonical small client

The non-ECS client should not build a second entity store. Nengi already applies
snapshot CRUD into `client.network.store`; use `Frame` for what changed this
snapshot and the store for current authoritative state.

```ts
import {
    AdaptiveInterpolator,
    Client
} from 'nengi'
import type { Frame } from 'nengi'

const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const interpolator = new AdaptiveInterpolator(client)
const channelByName = new Map<string, number>()
const sprites = new Map<number, Sprite>()

let controlledNid = 0

await client.connect('ws://localhost:8079', handshake)

function applyNetworkFrame(frame: Frame) {
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
        worldFrame.messages.forEach(message => {
            if (message.ntype === NType.Impact) {
                spawnImpactEffect(message.x, message.y)
            }
        })

        worldFrame.createEntities.forEach(entity => {
            if (entity.ntype === NType.Player) {
                sprites.set(entity.nid, createPlayerSprite(entity as PlayerEntity))
            }
        })

        worldFrame.updateEntities.forEach(update => {
            const entity = client.network.store.get(update.nid)
            if (entity) {
                markSpriteDirty(entity.nid, update.prop)
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

function render() {
    const nids = Array.from(sprites.keys()).filter(nid => nid !== controlledNid)
    const sample = interpolator.sampleEntities(nids, 100)

    sample.entities.forEach(entity => {
        const sprite = sprites.get(entity.nid)
        if (sprite) {
            sprite.x = entity.x
            sprite.y = entity.y
        }
    })
}

function frame() {
    for (const frame of client.network.drainFrames()) {
        applyNetworkFrame(frame)
    }

    render()
    sendMoveCommandsAtFixedRate()
    client.flush()
    requestAnimationFrame(frame)
}
```

The client meaning comes from channel identity first, then entity type. A
`Player` created in the world channel and a `Player` created in a separate
spectator, replay, or party channel may require different presentation.

## Boundaries

- Use `Channel` or `Channel2D/3D` when objects are normal replicated records.
- Use the raw client `EntityStore` as authoritative state.
- Use `Frame` facts to create, mark dirty, and destroy presentation.
- Use messages for one-shot context such as "you control this nid."
- Use commands for repeated input.
- Do not add a generic replica or binding layer by default.

If an entity moves between channels, model it as delete plus create. Do not
expect one stable `nid` to transfer between channels.
