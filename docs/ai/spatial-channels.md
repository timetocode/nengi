# Spatial channels

Spatial channels use grid cells to avoid processing entities outside a user's view. They win by skipping work.

## 2D, 3D, and projected planes

Use `SpatialChannel2D` for 2D worlds and for 3D games where culling is horizontal.

For 3D games that ignore vertical culling, use the `xz` plane:

```ts
const channel = new SpatialChannel2D(instance.localState, 100, {
    plane: 'xz'
})

channel.subscribe(user, {
    x: player.x,
    z: player.z,
    halfX: 500,
    halfZ: 500
})
```

Use `SpatialChannel3D` when vertical visibility matters.

## Views

2D views can be rectangular or coarse circular:

```ts
channel.subscribe(user, { x: 0, y: 0, halfWidth: 500, halfHeight: 500 })
channel.updateView(user, { x: 200, y: 100, radius: 500 })
```

3D views can be box or coarse sphere:

```ts
channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 500, halfHeight: 500, halfDepth: 500 })
channel.updateView(user, { x: 0, y: 0, z: 0, radius: 500 })
```

Circle and sphere views are coarse cell queries. Nengi includes occupied cells touched by the circle/sphere; it does not test every entity against the exact shape.

## Moving entities

For automatic spatial channels, update the spatial index when an entity moves:

```ts
player.x = nextX
player.y = nextY
channel.updateEntity(player)
```

For manual spatial channels, writer calls update dirty cell bookkeeping for mutation logs. If the movement changes cells, make sure the channel learns about the movement through the intended update path.

## Cell size

Cell size is a game-specific tuning knob.

Smaller cells:

- More precise culling.
- More cell bookkeeping.
- More cell keys per large view.

Larger cells:

- Less bookkeeping.
- More extra entities included near view edges.
- Better for sparse worlds or large views.

Start with a cell size near the size of meaningful interest areas, then benchmark.

## Messages

Spatial channel messages are culled immediately. When you call `addMessage(message)`, the channel checks current subscribed user views and queues the message directly to matching users.

This differs from non-spatial channels, which store broadcast messages until the snapshot boundary.

## When spatial helps

Spatial channels help when:

- The world has many entities.
- Each user sees a small fraction of the world.
- Users are spread out or clustered into limited areas.
- Visibility is naturally position-based.

Spatial channels help less when:

- Everyone sees almost everything.
- Entity counts are small.
- Visibility is permission-based rather than position-based.
- Views are so large that most cells are included.

## Manual spatial

Use `ManualSpatialChannel2D/3D` after profiling if spatial culling is useful and hot mutations are explicit. This is often the highest-performance path for large worlds with low mutation fractions.
