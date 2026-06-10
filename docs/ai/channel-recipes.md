# Channel recipes

These are starting points. Adapt the channel choice to the game's visibility and mutation pattern.

## Small arena where everyone sees everything

Use `Channel`.

```ts
const world = new Channel(instance.localState, { label: 'world' })
world.subscribe(user)
world.addEntity(player)
```

Start here unless the game has a clear reason not to.

## Large 2D world

Use `SpatialChannel2D`.

```ts
const world = new SpatialChannel2D(instance.localState, 100, { label: 'world' })
world.addEntity(monster)
world.subscribe(user, { x: player.x, y: player.y, halfWidth: 800, halfHeight: 600 })
```

Each server tick or view update:

```ts
world.updateView(user, { x: player.x, y: player.y, halfWidth: 800, halfHeight: 600 })
```

## 3D game with horizontal culling

Use `SpatialChannel2D` with `plane: 'xz'`.

```ts
const world = new SpatialChannel2D(instance.localState, 100, {
    plane: 'xz',
    label: 'world-xz'
})

world.subscribe(user, { x: player.x, z: player.z, halfX: 800, halfZ: 800 })
```

## True 3D space game

Use `SpatialChannel3D`.

```ts
const space = new SpatialChannel3D(instance.localState, 500, { label: 'space' })
space.subscribe(user, { x: ship.x, y: ship.y, z: ship.z, radius: 5000 })
```

Use a sphere view when the game thinks in sensor radius or engagement range.

## Private inventory or open chest

Use a private message for simple owner-only counters. Use `Channel` with a
schema-backed `header` when items need entity lifecycle, item metadata, slots,
drag/drop, multiple viewers, or container context.

For count-only inventory:

```ts
user.queueMessage({
    ntype: NType.InventoryCounts,
    wood,
    stone,
    gold
})
```

For item/entity inventory, the header is the client-visible context for the
channel; `label` is only local housekeeping.

```ts
const inventory = new Channel(instance.localState, {
    label: 'inventory',
    header: {
        nid: 0,
        ntype: NType.InventoryHeader,
        inventoryId,
        ownerUserId: user.id,
        slotCount: 24
    }
})

inventory.subscribe(user)
inventory.addEntity(item)
```

On the client, route item CRUD by the header:

```ts
const router = new ReplicaRouter(client)

router.channel(ctx => ctx.header?.ntype === NType.InventoryHeader)
    .onOpen(ctx => openInventory(ctx.header))
    .onCreate(NType.InventoryItem, (item, tracked, ctx) => addInventoryItem(ctx.header, item))
    .onUpdate(NType.InventoryItem, (update, item, tracked, ctx) => updateInventoryItem(ctx.header, item))
    .onClose(ctx => closeInventory(ctx.header))
```

This lets the client know the created item arrived through inventory context instead of the main world. When the inventory channel closes, nengi purges the contained item entities on the client and calls `onClose`; do not write inventory UI cleanup that requires one delete callback per item. If the UI or renderer keeps side tables keyed by nid, use `ctx.closed.entityNids` inside `onClose`.

If an item moves between two inventory channels, model that as a delete from the source channel and a create in the target channel. Do not keep the same entity id across channels unless nengi grows an explicit transfer primitive.

## Team-only state

Use one `Channel` per team.

```ts
const redTeam = new Channel(instance.localState, { label: 'team:red' })
redTeam.subscribe(redUser)
redTeam.addEntity(teamObjective)
```

Do not use spatial channels for permission-only visibility unless position also matters.

## Manual transform optimization

Start with `Channel` or `SpatialChannel2D`. If transform updates become hot and game code has a central movement system, switch to the matching manual channel.

```ts
const world = new ManualSpatialChannel2D(instance.localState, 100)
const Player = world.createEntityWriter(NType.Player, context.getSchema(NType.Player)!)

player.x = nextX
player.y = nextY
Player.position(player, nextX, nextY)
```

## ECS character

Use `EcsChannel` if all subscribed users see all ECS roots. Use `EcsSpatialChannel2D/3D` if roots need culling.

```ts
const ecs = new EcsChannel(instance.localState)
const Transform = ecs.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)
const Vitals = ecs.createComponentWriter(NType.Vitals, context.getSchema(NType.Vitals)!)

const pid = ecs.createEntity()
const transform = ecs.addComponent(pid, { nid: 0, ntype: NType.Transform, x: 0, y: 0 })
const vitals = ecs.addComponent(pid, { nid: 0, ntype: NType.Vitals, hp: 100 })

transform.x = nextX
transform.y = nextY
Transform.position(transform, nextX, nextY)
```

## Multiple composed channels

A game can use several channels for one player:

- Main world: `SpatialChannel2D`.
- Inventory: `Channel`.
- Party/team state: `Channel`.
- Remote map UI: another `SpatialChannel2D` with a different view.

Keep each channel's purpose clear.
