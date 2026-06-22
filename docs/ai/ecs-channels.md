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
