# Raw Client State

The recommended client-side surface is the raw nengi client state path:

```ts
binary snapshot -> ClientNetwork -> EntityStore -> Frame
```

`EntityStore` owns the latest authoritative state. `Frame` tells userland what
changed while applying one server snapshot. Userland owns rendering, local UI
state, prediction presentation, inventory widgets, sounds, and other game
objects.

Do not build a second entity store over nengi's store. Do not add a binding
layer unless the game has a real local architecture reason for one.

## Basic Loop

```ts
const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const interpolator = new AdaptiveInterpolator(client)
await client.connect('ws://localhost:8079', handshake)

function frame() {
    for (const frame of client.network.drainFrames()) {
        applyCreates(frame)
        applyUpdates(frame)
        applyDeletes(frame)
        applyMessages(frame)
    }

    syncInterpolatedSprites()
    runPrediction()
    client.flush()
    requestAnimationFrame(frame)
}
```

Always process queued frames in order. If the browser tab was hidden and several
snapshots are queued, drain and apply them sequentially. Do not skip later
snapshots to "catch up"; nengi snapshots contain deltas and skipping a snapshot
can desync the local store.

## Raw Authoritative State

Use `client.network.store` for latest raw server state:

```ts
const entity = client.network.store.get(nid)
const players = client.network.store.getByNType(NType.Player)
const inventoryItems = client.network.store.getByChannel(inventoryChannelId)
```

The store also tracks channel metadata:

```ts
const channelId = client.network.store.getEntityChannelId(nid)
const header = client.network.store.getChannelHeaderById(channelId)
```

Raw state is the authority that prediction reconciles against. Interpolated
state is a render sample, not the canonical game state.

## Plain Object Channels

Plain nengi channels replicate ordinary objects with `nid`, `ntype`, and schema
properties. This is the path for `Channel`, `Channel2D`, `Channel3D`, and the
matching manual channels.

On the server, add entities to the channel and either let automatic channels
diff object properties or call manual writers at the game's mutation points.
On the client, nengi applies snapshot CRUD into `EntityStore`; userland reads
the resulting channel-scoped facts from `Frame`.

For non-ECS games, use the raw store plus frame facts directly. The store is the
authoritative network state; sprites, view models, UI rows, audio events, and
prediction state stay in userland.

## Frame Facts

Each processed snapshot returns a `Frame`:

```ts
for (const frame of client.network.drainFrames()) {
    frame.channels.forEach(channel => {
        channel.createEntities.forEach(entity => {
            createSprite(entity)
        })

        channel.updateEntities.forEach(update => {
            const entity = client.network.store.get(update.nid)
            markSpriteDirty(entity, update.prop)
        })

        channel.deletedEntities.forEach(deleted => {
            destroySprite(deleted.nid)
        })
    })
}
```

`channel.updateEntities` contains applied changes with `previous` and `value`.
`channel.deletedEntities` includes the last known entity when available.

## Channel Scope

Channel-scoped data is available through `frame.channels`:

```ts
const inventory = frame.getChannel(inventoryChannelId)
if (inventory) {
    inventory.createEntities.forEach(createInventoryItem)
    inventory.updateEntities.forEach(updateInventoryItem)
    inventory.deletedEntities.forEach(removeInventoryItem)
}
```

Use channel headers for game meaning:

```ts
const header = client.network.store.getChannelHeaderById(inventoryChannelId)
```

Default headers carry channel id/type metadata and optional creation-time
`name`. Schema-backed headers carry structured context such as inventory id,
owner id, slot count, team id, or terminal mode.

## Interpolation

Use an interpolator for presentation, not for raw authority:

```ts
const sample = interpolator.sampleEntities(visibleMovingNids, interpDelay)
sample.entities.forEach(entity => {
    moveSprite(entity.nid, entity.x, entity.y)
})
```

Common choices:

```ts
interpolator.getEntity(nid, delay)
interpolator.getEntities(nids, delay)
interpolator.sampleEntities(nids, delay)
interpolator.sample(delay)
```

Render remote moving entities from interpolated samples. Render predicted local
entities from local predicted state and reconcile them against raw authority.

## Prediction

Prediction should read raw authority from `client.network.store` and keep local
predicted state in userland:

```ts
const movement = new CommandReplayPrediction({
    client,
    nid: () => controlledPlayerNid,
    getLocal: () => predictedTransform,
    applyCommand(state, command) {
        state.x += command.dx
        state.y += command.dy
    },
    affectedProps: ['x', 'y']
})
```

The helper sends commands, applies local prediction, and rebuilds local state
from latest authority plus pending commands during reconciliation. The store
remains the raw server truth.

## Messages

Immediate messages are available on the frame after authoritative state has
been applied:

```ts
frame.messages.forEach(message => {
    if (message.ntype === NType.YouArePlayer) {
        controlledPlayerNid = message.nid
    }
})
```

Interpolated messages use the interpolation timeline:

```ts
frame.interpolatedMessages.forEach(queueEffectMessage)
```

Use ordinary messages for UI/control context and notifications. Use
interpolated messages for transient effects that should line up with
interpolated entity motion.

## ECS Channels

For nengi ECS channels, use the same frame/store principle, but the natural
destination is a `GameEcsWorld` instead of plain presentation records.

ECS channel frames still contain normal component creates, updates, and deletes,
but they also include ECS root lifecycle facts. Prefer the core applier when a
client maintains a `GameEcsWorld`:

```ts
const channel = frame.getChannel(arenaChannelId)
if (channel) {
    const changes = applyEcsChannelFrameToWorld(ecs, channel)
    changes.createdComponents.forEach(createSpriteForComponent)
    changes.updatedComponents.forEach(markSpriteDirty)
    changes.deletedComponents.forEach(removeSpriteForComponent)
    changes.deletedEntities.forEach(removeRootPresentation)
}
```

Manual application is also possible when a game has a very small ECS bridge:

```ts
const channel = frame.getChannel(arenaChannelId)
if (channel) {
    channel.ecsCreateEntities.forEach(pid => ecs.createEntity(pid))
    channel.ecsCreateComponents.forEach(component => ecs.add(component))
    channel.updateEntities.forEach(update => setComponentProp(update))
    channel.ecsDeleteEntities.forEach(pid => ecs.removeEntity(pid))
}
```

Keep any ECS sync wrapper tiny: CRUD in, ECS mutation plus facts out. It should
not create sprites, bind roles, or decide prediction.

## What Not To Add

Avoid recreating legacy replica-style layers:

- no type-to-callback binding DSL as the default path
- no second entity store
- no generic replicated-object refs
- no renderer ownership
- no inventory-specific client framework
- no automatic prediction policy

The clean surface is small: raw store, frame facts, interpolation samples, and
prediction helpers.
