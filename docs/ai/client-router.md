# ReplicaRouter

`ReplicaRouter` is the normal client-side way to turn nengi snapshots into game
client state. It processes server frames, calls CRUD/message handlers, tracks
local renderer objects, and samples interpolated entities.

## Basic setup

```ts
const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const interpolator = new AdaptiveInterpolator(client)
const router = new ReplicaRouter(client, { interpolator })
```

Each render frame:

```ts
const batch = router.processServerFrames()
const sample = router.sampleInterpolated(100)
```

`processServerFrames()` applies pending authoritative snapshots in order. If a
client may have a large backlog after tab sleep or network jitter, use
`processServerFrames({ maxFrames })` to process a chunk without skipping frames.
Never skip delta frames; reconnect if the client is too far behind.

## Tracking entities

Create local renderer/game objects in create handlers and attach them to tracked
entities:

```ts
router.onCreate(NType.Player, entity => {
    const sprite = createPlayerSprite(entity)
    router.trackEntity(entity, {
        mode: ClientEntityMode.Interpolated,
        local: sprite
    })
})
```

Common modes:

- `Interpolated`: remote moving objects sampled from interpolation history.
- `Predicted`: locally controlled objects whose state is predicted/reconciled by
  game code.
- `Raw`: state that should be read immediately without interpolation, such as UI
  counters or inventory items.
- `Ignored`: userland can track but opt out of normal display flows.

## Applying interpolation

```ts
const sample = router.sampleInterpolated<Sprite>(100)

if (sample.state) {
    sample.entities.forEach(({ entity, tracked }) => {
        tracked.local.x = entity.x
        tracked.local.y = entity.y
    })
}

sample.exited.forEach(tracked => {
    tracked.local?.destroy()
})
```

Use `sample.exited` for interpolated entities that have left visibility or were
deleted after their interpolation tail finishes.

## Global CRUD

Global handlers see entities by type regardless of channel context:

```ts
router.onCreate(NType.Npc, entity => {})
router.onUpdate(NType.Npc, (update, entity) => {})
router.onDelete(NType.Npc, nid => {})
```

Use global CRUD for world objects, cross-cutting systems, and simple games with
one main channel.

## Channel-scoped CRUD

Use channel-scoped CRUD when the same entity type needs channel context, such as
inventory items, team-only state, or remote-map entities.

```ts
router.channel(ctx => ctx.header?.ntype === NType.InventoryHeader)
    .onOpen(ctx => openInventory(ctx.header))
    .onCreate(NType.InventoryItem, (item, tracked, ctx) => {
        addInventoryItem(ctx.header.inventoryId, item)
    })
    .onUpdate(NType.InventoryItem, (update, item, tracked, ctx) => {
        updateInventoryItem(ctx.header.inventoryId, item)
    })
    .onClose(ctx => {
        closeInventory(ctx.header.inventoryId)
    })
```

Global and channel-scoped CRUD both fire if both are registered. Do not register
both for the same side effect unless that is deliberate.

## Channel close

When a known headered channel closes, nengi purges entities that arrived through
that channel and calls `onClose`.

```ts
router.channel(ctx => ctx.header?.ntype === NType.InventoryHeader)
    .onClose(ctx => {
        removeInventoryWindow(ctx.header.inventoryId)
        ctx.closed?.entityNids.forEach(nid => removeRendererSideTable(nid))
    })
```

Do not depend on receiving one delete callback per contained entity on channel
close.

## Messages

Immediate messages run as soon as the snapshot is processed:

```ts
router.onMessage(NType.YouArePlayer, message => {
    router.setMode(message.nid, ClientEntityMode.Predicted)
})
```

Interpolated messages run when the interpolation timeline reaches their frame:

```ts
router.onInterpolatedMessage(NType.ShotFired, message => {
    drawShot(message)
})
```

Use interpolated messages for effects that should line up with interpolated
entity movement. The message payload is not interpolated; its delivery timing is
synced to the interpolation timeline.

