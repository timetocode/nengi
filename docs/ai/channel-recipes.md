# Channel recipes

These are model recipes. Adapt the channel choice to the game's visibility rule,
mutation style, and client UI shape.

## Small arena where everyone sees everything

Use `Channel`.

```ts
const world = new Channel(instance.localState, { name: 'world' })
world.subscribe(user)
world.addEntity(player)
```

Use this when the game design really is shared visibility, not merely because it
is the smallest example.

## Large 2D world

Use `SpatialChannel2D`.

```ts
const world = new SpatialChannel2D(instance.localState, 100, { name: 'world' })
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
    name: 'world-xz'
})

world.subscribe(user, { x: player.x, z: player.z, halfX: 800, halfZ: 800 })
```

## True 3D space game

Use `SpatialChannel3D`.

```ts
const space = new SpatialChannel3D(instance.localState, 500, { name: 'space' })
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
channel. Add `name` only when a simple channel name is useful.

```ts
const inventory = new Channel(instance.localState, {
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

If a channel only needs a simple name, use `name`. Use a schema-backed header
object when scoped entity handling needs client-visible structured fields.
Default header names are creation-time metadata. If the client needs mutable
channel context, pass a schema-backed header object, mutate that object on the
server, and call `channel.markHeaderDirty()`.

On the client, process the inventory channel's frame bucket:

```ts
for (const frame of client.network.drainFrames()) {
    const inventory = frame.getChannel(inventoryChannelId)
    if (!inventory) {
        continue
    }

    const header = client.network.store.getChannelHeaderById(inventoryChannelId) as InventoryHeader
    openInventory(header)

    inventory.createEntities.forEach(item => addInventoryItem(header, item as InventoryItem))
    inventory.updateEntities.forEach(update => {
        const item = client.network.store.get(update.nid)
        if (item) {
            updateInventoryItem(header, item as InventoryItem)
        }
    })
    inventory.deletedEntities.forEach(deleted => removeInventoryItem(deleted.nid))

    frame.closedChannels.forEach(closed => {
        if (closed.channelId === inventoryChannelId) {
            closeInventory(header)
            closed.entityNids.forEach(removeInventoryItem)
        }
    })
}
```

This lets the client know the created item arrived through inventory context
instead of the main world. When the inventory channel closes, nengi purges the
contained item entities on the client and reports the purged ids in
`frame.closedChannels`; do not write inventory UI cleanup that requires one
delete callback per item.

If an item moves between two inventory channels, model that as a delete from the source channel and a create in the target channel. Do not keep the same entity id across channels unless nengi grows an explicit transfer primitive.

## Team-only state

Use one `Channel` per team.

```ts
const redTeam = new Channel(instance.localState, { name: 'team:red' })
redTeam.subscribe(redUser)
redTeam.addEntity(teamObjective)
```

Do not use spatial channels for permission-only visibility unless position also matters.

## Manual transform path

Use a manual channel when movement or transform mutation already flows through a
central game function. The important requirement is not that the feature is
"advanced"; it is that every networked mutation reliably calls the writer.

```ts
const world = new ManualSpatialChannel2D(instance.localState, 100)
const Player = world.createEntityWriter(NType.Player, context.getSchema(NType.Player)!)

player.x = nextX
player.y = nextY
Player.position(player, nextX, nextY)
```

For spatial manual writers, `strictManualWrites: true` makes writer calls throw
when the entity or component cannot be resolved to a spatial cell. This is useful
while proving the game mutation path; missed or misrouted writer calls are
desync bugs, not harmless debug noise.

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
