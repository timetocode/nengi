# Manual mutations

Manual channels are the explicit-mutation path where game code tells nengi
exactly what changed. This avoids scanning visible entities and diffing every
schema property.

Manual does not mean safer. It means the game's mutation API becomes part of the
networking contract.

## When to use manual mutations

Use manual mutations when:

- The game has a central mutation point for the hot data.
- Most entities or properties do not change every tick.
- Update groups can write common bundles such as position/rotation together.
- The team is willing to make missed writer calls a correctness bug in userland.

Automatic channels are better when state changes from many places and there is
no clear mutation API. Manual channels are better when the game already has
functions like `movePlayer`, `setHealth`, `equipItem`, or component systems that
own the relevant mutations.

## Manual entity writers

Use `createEntityWriter(ntype, schema)` with:

- `ManualChannel`
- `ManualChannel2D`
- `ManualChannel3D`

Example:

```ts
const channel = new ManualChannel(instance.localState)
const Player = channel.createEntityWriter(NType.Player, context.getSchema(NType.Player)!)

const player = channel.addEntity({
    nid: 0,
    ntype: NType.Player,
    x: 0,
    y: 0,
    hp: 100
})

player.x = nextX
player.y = nextY
Player.position(player, nextX, nextY)
```

Writers expose:

- `writer.props.name(entity, value)` for explicit single-property writes.
- `writer.groups.name(entity, ...values)` for explicit update groups.
- Top-level aliases like `writer.position(...)` when the schema name does not collide with reserved fields or another writer.

Prefer group writers for common hot bundles.

## ECS component writers

Use `createComponentWriter(ntype, schema)` with:

- `EcsChannel`
- `EcsChannel2D`
- `EcsChannel3D`

Example:

```ts
const channel = new EcsChannel(instance.localState)
const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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

## Important rule

Mutate the game object and call the writer in the same logical mutation path. If game code mutates a property but does not call the writer, nengi will not send that manual update.

For spatial manual paths, enable `strictManualWrites: true` during development
when you want writer calls to throw if the target entity/component is not in a
known spatial cell. Leave it off for the smallest hot path once the mutation
surface is proven.

## Common mistakes

- Choosing `ManualChannel` when the game has no reliable mutation path.
- Mutating manual entities in many systems without a shared mutation API.
- Forgetting writer calls for less common properties.
- Calling a writer for an entity that is not in the channel or visible cell.
- Treating `strictManualWrites` as a runtime synchronization feature. It is a
  validation aid; the game still has to route mutations through the right
  channel/writer.
- Using single prop writes for transform data that has a useful update group.

## Debug strategy

During development, consider wrapping game mutation APIs so game systems cannot mutate networked state without also calling the writer. For performance builds, keep the hot path direct.

## Decision path

A good workflow when automatic and manual both model the feature correctly:

1. Identify the channel from visibility: all-visible, 2D spatial, 3D spatial, or ECS.
2. Identify whether mutations are centralized enough for manual writers.
3. Add update groups for common bundles.
4. Benchmark automatic versus matching manual with a game-shaped workload.
5. Keep manual only where the explicit mutation contract is clear and useful.
