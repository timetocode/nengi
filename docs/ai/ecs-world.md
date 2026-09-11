# ECS world, resources, and queries

`EcsWorld` is a userland ECS state and query surface. It is separate from an
`EcsChannel`, which owns network ids, visibility, component writers, and snapshot
emission. A server and a client normally have different `EcsWorld` instances.
On the server, an optional `bindEcsChannel` projection keeps a selected set of
world roots and one ECS channel structurally aligned.

## Components and roots

An ECS root is an id. Components carry the state:

```ts
const Transform = ecs.defineComponent<TransformComponent>(NType.Transform, 'Transform')
const world = new EcsWorld()

const pid = world.createEntity()
world.add(Transform.create({
    pid,
    x: 0,
    y: 0
}))
```

Network components have a positive `nid` after they are added to an
`EcsChannel`. Local components may omit `nid` and use `ecs.defineLocalComponent`;
`EcsWorld` then allocates negative local ids. Local components are ordinary ECS state; they are not serialized by nengi.

## Resources

Use a resource for shared state or a service with one owner in a world, not for
data that belongs to one networked entity:

```ts
type Clock = { tick: number, nowMs: number }
const Clock = ecs.defineResource<Clock>('Clock')

world.setResource(Clock, { tick: 0, nowMs: 0 })
const clock = world.resource(Clock)
```

Resource keys use object identity. Define a token once and import that token
where it is needed; calling `ecs.defineResource('Clock')` twice creates two
different keys even though their names match. `world.resource(key, create)`
can lazily create a missing resource, while `world.resource(key)` throws a
descriptive missing-resource error.

Typical resources include:

- server runtime and adapter state
- spawn, clock, historian, or validation state
- client renderer, camera, input, or presentation services
- indexes that coordinate several systems

Keep resource ownership explicit. A resource can be a meaningful boundary for a
service or shared mutable state, but it should not become a universal bag passed
to every function. Systems should request the resource they actually use and
keep ordinary decisions in functions over small values.

## Queries

Use `query` for a direct composition scan:

```ts
world.query(Transform).all((pid, transform) => {
    updateTransform(pid, transform, clock)
})
```

Use `cachedQuery` when membership is queried repeatedly and the composition
changes less often than the component values. Cached query membership refreshes
lazily when `all()` or `pids()` is read. `flushQueries()` is an optional eager
boundary when a tick wants all cached memberships refreshed before later work.

Component values are not frozen by the world. A query cache tracks which roots
match; it does not snapshot component state. Server systems may mutate their
authoritative components and client systems may mutate local-only components.
Treat received replicated client components as read-only; use a separate copy
for prediction or presentation changes. See [client-state.md](./client-state.md).

## Network binding

Use `bindEcsChannel` when the server's authoritative ECS world and an ECS
channel should share component objects and structural lifecycle. The binding
owns only roots created through it. It does not make every world entity
networked, and it does not prevent raw code from bypassing the binding.

The binding constructs network metadata itself. Callers provide only gameplay
state:

```ts
const worldChannel = new EcsChannel2D(instance.localState, 100)
const replicated = bindEcsChannel(world, worldChannel, { context })
const TransformNet = replicated.component(Transform)
const ActorNet = replicated.component(Actor)

const pid = replicated.createEntity()
const transform = TransformNet.addSpatial(pid, {
    x: 100,
    y: 100,
    z: 0,
    rotation: 0,
    radius: 10
})
const actor = ActorNet.add(pid, {
    kind: 1,
    hp: 100,
    team: 1
})

TransformNet.mutate.patch(transform, { x: 120, y: 105 })
TransformNet.mutate.groups.pose(transform, 120, 105, 0.5)

// Append-only mode leaves assignment to the caller.
transform.x = 125
TransformNet.writer.props.x(transform, transform.x)
```

`mutate` assigns component fields and emits their pending network mutations.
`writer` emits only and leaves component assignment to the caller. Property
patches emit property mutations; update-group mutators assign all group fields
and emit one grouped mutation.

For every binding operation, the binding checks that the PID is owned by the
binding, present in the world, and an active root in the channel. If those
facts disagree because raw code changed one store, the operation fails instead
of silently repairing the projection.

`addSpatial` exists only for `EcsChannel2D` and `EcsChannel3D`. A plain
`EcsChannel` exposes `add` but not spatial construction. A spatial root may
remain unpositioned before selection or after its selected component is removed.
Bound component removal still works in that state; bound writers and mutators
require a selected spatial component. Select one before emitting updates.

Local components remain ordinary world state. A component created with
`ecs.defineLocalComponent` cannot be registered through the binding, but it can
be added directly to a bound root. Removing the bound root removes that local
component through `EcsWorld`; it is never serialized by the channel.

For manual, unbound code, remove the root from the `EcsWorld` before removing it
from the network channel. The channel unregisters network component ids during
removal.
On the client, use `applyEcsChannelFrame` and `applyEcsChannelClose`; use
`beforeRemoveEntity` to release renderer, collider, or UI resources before a
root and its local components disappear.

The normal client boundary remains: network frame facts in, ECS state updated,
presentation systems observe the ECS world. The server binding is optional and
does not change client frame application.
