# Manual mutations

Manual channels are the performance path where game code tells nengi exactly what changed. This avoids scanning visible entities and diffing every schema property.

Manual does not mean safer. It means faster when used correctly.

## When to use manual mutations

Use manual mutations when:

- The feature is already correct with automatic channels, and profiling shows snapshot work matters.
- The game has a central mutation point for the hot data.
- Most entities or properties do not change every tick.
- Update groups can write common bundles such as position/rotation together.

Do not use manual mutations only because they are available.

## Manual entity writers

Use `createEntityWriter(ntype, schema)` with:

- `ManualChannel`
- `ManualSpatialChannel2D`
- `ManualSpatialChannel3D`

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
- `EcsSpatialChannel2D`
- `EcsSpatialChannel3D`

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

## Common mistakes

- Switching to `ManualChannel` before the feature is correct.
- Mutating manual entities in many systems without a shared mutation API.
- Forgetting writer calls for less common properties.
- Calling a writer for an entity that is not in the channel or visible cell.
- Using single prop writes for transform data that has a useful update group.

## Debug strategy

During development, consider wrapping game mutation APIs so game systems cannot mutate networked state without also calling the writer. For performance builds, keep the hot path direct.

## Optimization path

A good workflow:

1. Build with `Channel` or `SpatialChannel2D/3D`.
2. Add a benchmark resembling the real game.
3. Identify hot schemas/properties.
4. Add update groups for common bundles.
5. Move only the hot path to the matching manual channel.
6. Re-benchmark.
