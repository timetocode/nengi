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
is the smallest snippet.

## Large 2D world

Use `Channel2D`.

```ts
const world = new Channel2D(instance.localState, 100, { name: 'world' })
world.addEntity(monster)
world.subscribe(user, { x: player.x, y: player.y, halfWidth: 800, halfHeight: 600 })
```

Each server tick or view update:

```ts
world.updateView(user, { x: player.x, y: player.y, halfWidth: 800, halfHeight: 600 })
```

## 3D game with horizontal culling

Use `Channel2D` with `plane: 'xz'`.

```ts
const world = new Channel2D(instance.localState, 100, {
    plane: 'xz',
    name: 'world-xz'
})

world.subscribe(user, { x: player.x, z: player.z, halfX: 800, halfZ: 800 })
```

## True 3D space game

Use `Channel3D`.

```ts
const space = new Channel3D(instance.localState, 500, { name: 'space' })
space.subscribe(user, { x: ship.x, y: ship.y, z: ship.z, radius: 5000 })
```

Use a sphere view when the game thinks in sensor radius or engagement range.

## Application tick per publication

When the game can run zero or several simulation steps per `instance.step()`,
carry its simulation tick in a schema-backed channel header. Register the same
schema on the server and client:

```ts
type WorldHeader = {
    nid: number
    ntype: number
    physicsTick: number
    publication: number
}

context.register(NType.WorldHeader, defineEntitySchema({
    physicsTick: Binary.UInt32,
    publication: Binary.UInt32
}))
```

On the server, subscribe the user to the channel and update its header after
simulation and entity writes, before publishing:

```ts
const header: WorldHeader = {
    nid: 0,
    ntype: NType.WorldHeader,
    physicsTick: 0,
    publication: 0
}
const world = new ManualChannel(instance.localState, { name: 'world', header })
world.subscribe(user)

function publishWorld(physicsTick: number) {
    header.physicsTick = physicsTick
    header.publication++
    world.syncHeader()
    instance.step()
}
```

Header changes and entity changes arrive in the same snapshot. Header-only
updates work when no entities changed. An unchanged header does not need an
update; the optional publication counter distinguishes snapshots sharing the
same physics tick. This is replicated channel state, not a separate event.

On the client, discover `worldChannelId` from the channel open and process one
frame at a time so the raw store and header describe the same publication:

```ts
let frame
while ((frame = client.network.processNextFrame())) {
    applyNetworkFrame(frame) // Includes channel opens/closes and identity setup.
    const header = client.network.store.getChannelHeaderById(worldChannelId) as WorldHeader | undefined
    if (!header) continue

    saveCheckpoint({
        physicsTick: header.physicsTick,
        publication: header.publication,
        bodies: copyAuthoritativeBodies(client.network.store)
    })
}
```

`copyAuthoritativeBodies` and `saveCheckpoint` are game-owned operations. Copy
the values you retain: the raw store and its header advance on the next applied
frame. Do not use `drainFrames()` followed by store lookups to reconstruct each
earlier frame in that batch. Games owning their interpolation/history can
[disable nengi entity history](./client-state.md#games-that-own-their-history).

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
server, and call `channel.syncHeader()`.

On the client, process the inventory channel's frame bucket:

```ts
let frame
while ((frame = client.network.processNextFrame())) {
    frame.closedChannels.forEach(closed => {
        if (closed.channelId === inventoryChannelId) {
            closeInventory(closed.header)
            closed.entityNids.forEach(removeInventoryItem)
        }
    })

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
const world = new ManualChannel2D(instance.localState, 100)
const Player = world.createEntityWriter(NType.Player, context.getSchema(NType.Player)!)

player.x = nextX
player.y = nextY
Player.groups.position(player, nextX, nextY)
```

For spatial manual writers, `validateManualWriteTargets: true` makes writer
calls throw when the entity or component cannot be resolved to a spatial cell.
This is useful while proving the game mutation path; missed or misrouted writer
calls are desync bugs, not harmless diagnostic noise.

The writer call also refreshes spatial membership before snapshot output, so a
normal manual position mutation does not need a separate spatial update call.

## ECS character with a channel-owned state boundary

Use `bindEcsChannel` when an `EcsWorld` is the authoritative state boundary and
the ECS channel is its network projection. See [ecs-world.md](./ecs-world.md)
for the binding lifecycle and mutation contracts.

## ECS character without an EcsWorld

Use `EcsChannel` if all subscribed users see all ECS roots. Use `EcsChannel2D/3D` if roots need culling.

This lower-level shape is appropriate when the channel itself is the
authoritative state boundary.

```ts
const worldChannel = new EcsChannel(instance.localState)
const Transform = worldChannel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)
const Vitals = worldChannel.createComponentWriter(NType.Vitals, context.getSchema(NType.Vitals)!)

const pid = worldChannel.createEntity()
const transform = worldChannel.addComponent(pid, { nid: 0, ntype: NType.Transform, x: 0, y: 0 })
const vitals = worldChannel.addComponent(pid, { nid: 0, ntype: NType.Vitals, hp: 100 })

transform.x = nextX
transform.y = nextY
Transform.groups.position(transform, nextX, nextY)
```

## Multiple composed channels

A game can use several channels for one player:

- Main world: `Channel2D`.
- Inventory: `Channel`.
- Party/team state: `Channel`.
- Remote map UI: another `Channel2D` with a different view.

Keep each channel's purpose clear.
