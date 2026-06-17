# Anti-patterns

Use this file when a design feels too complex or too clever.

## Choosing by perceived speed instead of model

Do not choose manual spatial ECS just because it sounds fastest. Choose by the
game's shape:

- shared visibility: `Channel`
- position-based visibility: spatial channel
- explicit mutation points: manual channel
- nengi ECS roots/components: ECS channel

If multiple choices are plausible, benchmark the game-shaped workload.

## Putting the same entity in multiple channels

Avoid adding the same entity to multiple channels. Nengi's production hot path assumes this is a userland mistake, not something to dedupe or repair.

If the client needs channel context, give the channel a schema-backed `header` and route client CRUD through that header. Do not put the same entity in multiple channels to carry context.

## Reading entity.nid after removal

`removeEntity(entity)` returns the removed nid, or `0` if the entity was not removed. Use that return value for userland maps.

Do not do this:

```ts
channel.removeEntity(item)
itemsByNid.delete(item.nid)
```

Successful removal clears `item.nid`, so the delete may use `0` instead of the old id.

Do this:

```ts
const removedNid = channel.removeEntity(item)
if (removedNid !== 0) {
    itemsByNid.delete(removedNid)
}
```

For plain object channels and spatial channels, remove the exact object that was added. A different object with the same `nid` will not be removed. ECS channels are id-first and may remove by root id.

## One channel per entity

Channels are visibility/subscription containers, not replicated objects. Do not create a channel for every entity unless the game truly has a subscription container per entity.

## Spatial channels for non-spatial visibility

Do not use spatial channels for inventory, team-only data, quest state, permission checks, or UI state unless position also determines visibility.

Use `Channel` for private or grouped non-spatial state.

## Manual mutations without a mutation API

Manual channels require game code to call writers. If any system can mutate networked state directly, updates can be missed.

Create game-level mutation functions when needed:

```ts
function movePlayer(player: PlayerEntity, x: number, y: number) {
    player.x = x
    player.y = y
    PlayerWriter.position(player, x, y)
}
```

## Sending persistent state as messages

Use entities for persistent state. Use messages for transient events.

Bad fit for messages:

- Player position.
- Inventory contents.
- Health.
- Door open/closed state that new subscribers need to know.

Good fit for messages:

- One-time sound cue.
- Hit marker.
- Chat line.
- Short-lived notification.

## Using ECS channels for ordinary objects

Use ECS channels when roots are ids and state is in components. If the game has ordinary objects with small schemas, `Channel` or `SpatialChannel2D/3D` is simpler.

## Huge flat entity by default

A very wide entity can work, but it may make every scan/update path larger. If only a few parts of the state change independently, consider components or separate entities.

Do not choose ECS blindly; benchmark the real mutation pattern.

## Ignoring benchmark shape

A benchmark where everyone sees everything does not prove spatial channels are bad. A benchmark where only 1% mutates does not prove automatic channels are bad. Match the benchmark to the game.
