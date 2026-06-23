# ECS channels

Nengi ECS channels assume a specific network ECS shape. Do not assume they match every ECS library or every use of the word ECS.

## The model

In a plain `Channel`, an entity is a replicated object with state. Nengi can scan the object and diff schema properties.

In `EcsChannel`, a root entity is only a network id. The state lives on component entities.

Root:

- Has an `nid`.
- Groups components.
- Has no schema properties for nengi to scan.

Component:

- Has its own `nid`.
- Has an `ntype`.
- Has schema properties.
- Has `pid`, the parent/root id.

Define each replicated ECS component type beside its nengi schema, component
type descriptor, and create function. See [shared-state.md](./shared-state.md)
for the recommended file shape. Do not give the root entity a schema; networked
state lives on components. Do not put component writers in shared component
files because writers are bound to a specific server channel instance.

## Basic ECS channel

```ts
const channel = new EcsChannel(instance.localState)
const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

channel.subscribe(user)

const pid = channel.createEntity()
const transform = channel.addComponent(pid, {
    nid: 0,
    ntype: NType.Transform,
    x: 0,
    y: 0
})

transform.x = nextX
transform.y = nextY
Transform.position(transform, nextX, nextY)
```

## Spatial ECS

Spatial ECS channels place roots in the grid using a selected spatial component. The root itself does not have position.

```ts
const channel = new EcsChannel2D(instance.localState, 100)
const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

channel.subscribe(user, { x: 0, y: 0, halfWidth: 500, halfHeight: 500 })

const pid = channel.createEntity()
const transform = channel.addSpatialComponent(pid, {
    nid: 0,
    ntype: NType.Transform,
    x: 0,
    y: 0
})

transform.x = nextX
transform.y = nextY
Transform.position(transform, nextX, nextY)
channel.updateSpatialComponent(transform)
```

Use `EcsChannel3D` when vertical culling matters.

## Canonical small server

This is the intended minimal shape for a server-authoritative 2D ECS world.
The server owns gameplay state in a `GameEcsWorld`, authors network state through
an `EcsChannel2D`, and calls component writers at explicit mutation points.

Assume `NType`, schemas, and factory functions such as `createPlayer`,
`createTransform`, and `createContext` are defined by the game.

```ts
import {
    CommandRouter,
    EcsChannel2D,
    GameEcsWorld,
    Instance,
    NetworkEvent,
    User,
    gameComponentType
} from 'nengi'

const context = createContext()
const instance = new Instance(context)
const ecs = new GameEcsWorld()
const world = new EcsChannel2D(instance.localState, 100, { name: 'world' })

const Player = gameComponentType<PlayerComponent>(NType.Player, 'Player')
const Transform = gameComponentType<TransformComponent>(NType.Transform, 'Transform')

const TransformWriter = world.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

const playerPidByUser = new Map<number, number>()
const commands = new CommandRouter()

function viewFor(transform: TransformComponent) {
    return { x: transform.x, y: transform.y, halfWidth: 800, halfHeight: 600 }
}

function spawnPlayer(user: User) {
    const pid = world.createEntity()
    ecs.createEntity(pid)

    const transform = world.addSpatialComponent(pid, createTransform(100, 100))
    const player = world.addComponent(pid, createPlayer())

    ecs.add(transform)
    ecs.add(player)

    playerPidByUser.set(user.id, pid)
    world.subscribe(user, viewFor(transform))
}

function removePlayer(user: User) {
    const pid = playerPidByUser.get(user.id)
    if (pid === undefined) {
        return
    }

    playerPidByUser.delete(user.id)

    // Remove from the game ECS before the channel unregisters components and
    // returns their nids to 0.
    ecs.removeEntity(pid)
    world.removeEntity(pid)
}

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const pid = playerPidByUser.get(user.id)
    if (pid === undefined) {
        return
    }

    const transform = ecs.require(pid, Transform)
    transform.x += command.inputX * 10
    transform.y += command.inputY * 10

    TransformWriter.props.x(transform, transform.x)
    TransformWriter.props.y(transform, transform.y)
    world.updateSpatialComponent(transform)
    world.updateView(user, viewFor(transform))
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

The important boundaries:

- The root `pid` is the gameplay entity id.
- Networked state lives on components.
- The channel creates/removes network ids.
- `GameEcsWorld` is the game query surface.
- Component writers are the only way manual component mutations reach clients.

If the game has several ECS spaces, create several channels and give each
channel a header or name that the client can classify.

## Canonical small client

On the client, classify opened channels, apply ECS channel frames to a
`GameEcsWorld`, and keep presentation code outside the network applier.

```ts
import {
    Client,
    GameEcsWorld,
    applyEcsChannelFrameToWorld,
    gameComponentType
} from 'nengi'

const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const ecs = new GameEcsWorld()
const channelByName = new Map<string, number>()

const Player = gameComponentType<PlayerComponent>(NType.Player, 'Player')
const Transform = gameComponentType<TransformComponent>(NType.Transform, 'Transform')

await client.connect('ws://localhost:8079', handshake)

function applyNetworkFrame(frame) {
    frame.openedChannels.forEach(channel => {
        if (channel.header.name === 'world') {
            channelByName.set('world', channel.channelId)
        }
    })

    frame.channels.forEach(channel => {
        if (channel.channelId !== channelByName.get('world')) {
            return
        }

        const changes = applyEcsChannelFrameToWorld(ecs, channel)
        changes.createdComponents.forEach(component => {
            if (component.ntype === NType.Player) {
                createPlayerPresentation(component.pid)
            }
        })
        changes.updatedComponents.forEach(update => {
            markPresentationDirty(update.component.pid, update.prop)
        })
        changes.deletedEntities.forEach(pid => {
            destroyPresentation(pid)
        })
    })

    frame.closedChannels.forEach(channel => {
        if (channel.channelId === channelByName.get('world')) {
            channelByName.delete('world')
        }
    })
}

function frame() {
    for (const frame of client.network.drainFrames()) {
        applyNetworkFrame(frame)
    }

    ecs.query(Player, Transform).all((pid, player, transform) => {
        renderPlayer(pid, player, transform)
    })

    client.flush()
    requestAnimationFrame(frame)
}
```

For multiple ECS channels, do not infer meaning from component type alone. Route
by channel identity first, then apply the frame to the appropriate local world
or feature system.

## When to use ECS channels

Use ECS channels when:

- The game already treats entities as ids and state as components.
- Systems have explicit mutation points.
- Components are individually meaningful network records.
- You want to send one changed component without scanning or sending a wide object.

Avoid ECS channels when:

- The game is object-oriented and each object already has a small schema.
- You only need parent/child visibility, not root/component network identity.
- Your ECS allows arbitrary recursive/cyclic graphs that do not match nengi's one root-to-components layer.

## ECS vs parent/child entities

Parent/child entities are a visibility cascade in the normal entity model. If a parent is visible, children become visible too.

ECS channels are a different network model: roots are ids, and components are the replicated records.

Do not confuse these two. Parent/child is useful for scenegraph-like or object-with-parts state. ECS channels are useful for root ids plus component state.

## Mutation responsibility

ECS channels are manual. If a component changes and game code does not call the component writer, nengi will not send the update.

Do not call component writers with draft components that have not been added to
the channel. A component with `nid: 0` is not networked. After a successful
`removeEntity`, component nids may be returned to `0`; capture any ids you need
before removal.
