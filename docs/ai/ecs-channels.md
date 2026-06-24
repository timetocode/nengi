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

Use plain objects for canonical ECS components. They make the network schema,
serialized fields, and explicit writer calls obvious:

```ts
const Transform = ecs.defineComponent<TransformComponent>(NType.Transform, 'Transform')

const transform = Transform.create({
    pid,
    nid: 0,
    x: 0,
    y: 0
})
```

Class instances are allowed when they expose the ECS fields directly and
serialize like plain objects:

```ts
class TransformComponent {
    readonly ntype = NType.Transform
    nid?: number

    constructor(
        public pid: number,
        public x: number,
        public y: number
    ) {}
}

const transform = world.add(new TransformComponent(pid, 0, 0))
```

Keep class behavior shallow. Hidden component methods that mutate networked
state can obscure the required channel writer call. Use `nid: 0` only when
passing a new component through an ECS channel that will assign its network id;
leave `nid` undefined for local components added directly to an `EcsWorld`.

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
```

Use `EcsChannel3D` when vertical culling matters.

## Canonical small server

This is the intended minimal shape for a server-authoritative 2D ECS world.
The server owns gameplay state in an `EcsWorld`, authors network state through
an `EcsChannel2D`, and calls component writers at explicit mutation points.

Assume `NType`, schemas, and factory functions such as `createPlayer`,
`createTransform`, and `createContext` are defined by the game.

```ts
import {
    CommandRouter,
    EcsChannel2D,
    EcsWorld,
    Instance,
    NetworkEvent,
    User,
    ecs
} from 'nengi'

const context = createContext()
const instance = new Instance(context)
const world = new EcsWorld()
const worldChannel = new EcsChannel2D(instance.localState, 100, { name: 'world' })

const Player = ecs.defineComponent<PlayerComponent>(NType.Player, 'Player')
const Transform = ecs.defineComponent<TransformComponent>(NType.Transform, 'Transform')

const TransformWriter = worldChannel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

const playerPidByUser = new Map<number, number>()
const commands = new CommandRouter()

function viewFor(transform: TransformComponent) {
    return { x: transform.x, y: transform.y, halfWidth: 800, halfHeight: 600 }
}

function spawnPlayer(user: User) {
    const pid = worldChannel.createEntity()
    world.createEntity(pid)

    const transform = worldChannel.addSpatialComponent(pid, createTransform(100, 100))
    const player = worldChannel.addComponent(pid, createPlayer())

    world.add(transform)
    world.add(player)

    playerPidByUser.set(user.id, pid)
    worldChannel.subscribe(user, viewFor(transform))
}

function removePlayer(user: User) {
    const pid = playerPidByUser.get(user.id)
    if (pid === undefined) {
        return
    }

    playerPidByUser.delete(user.id)

    // Remove from the game ECS before the channel unregisters components and
    // returns their nids to 0.
    world.removeEntity(pid)
    worldChannel.removeEntity(pid)
}

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const pid = playerPidByUser.get(user.id)
    if (pid === undefined) {
        return
    }

    const transform = world.require(pid, Transform)
    transform.x += command.inputX * 10
    transform.y += command.inputY * 10

    TransformWriter.props.x(transform, transform.x)
    TransformWriter.props.y(transform, transform.y)
    worldChannel.updateView(user, viewFor(transform))
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
- `EcsWorld` is the game query surface.
- ECS resources aka singletons live in `EcsWorld` when systems need shared
  services or state that is not a component on one entity.
- Component writers are the only way manual component mutations reach clients.
- Spatial ECS writers also refresh the root's spatial cell before snapshot output.
  Call `updateSpatialComponent` only for direct spatial changes that do not go
  through a component writer.

If the game has several ECS spaces, create several channels and give each
channel a header or name that the client can classify.

## Canonical small client

On the client, classify opened channels, apply ECS channel frames to an
`EcsWorld`, and keep presentation code outside the network applier.

```ts
import {
    Client,
    EcsWorld,
    applyEcsChannelClose,
    applyEcsChannelFrame,
    ecs
} from 'nengi'
import type { Frame } from 'nengi'

const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const world = new EcsWorld()
const channelByName = new Map<string, number>()

const Player = ecs.defineComponent<PlayerComponent>(NType.Player, 'Player')
const Transform = ecs.defineComponent<TransformComponent>(NType.Transform, 'Transform')

await client.connect('ws://localhost:8079', handshake)

function applyNetworkFrame(frame: Frame) {
    frame.openedChannels.forEach(channel => {
        if (channel.header.name === 'world') {
            channelByName.set('world', channel.channelId)
        }
    })

    frame.channels.forEach(channel => {
        if (channel.channelId !== channelByName.get('world')) {
            return
        }

        channel.messages.forEach(handleWorldMessage)

        const changes = applyEcsChannelFrame(world, channel)
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
            const changes = applyEcsChannelClose(world, channel)
            changes.deletedEntities.forEach(pid => {
                destroyPresentation(pid)
            })
            channelByName.delete('world')
        }
    })
}

function frame() {
    for (const frame of client.network.drainFrames()) {
        applyNetworkFrame(frame)
    }

    world.query(Player, Transform).all((pid, player, transform) => {
        renderPlayer(pid, player, transform)
    })

    client.flush()
    requestAnimationFrame(frame)
}
```

For multiple ECS channels, do not infer meaning from component type alone. Route
by channel identity first, then apply the frame or close event to the appropriate
local world or feature system. `applyEcsChannelClose()` removes the closed
channel's network components from an `EcsWorld` while preserving local-only
components.

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
