# ClientReplica

`ClientReplica` is the normal client-side bridge from nengi snapshots to game
client state. It processes pending server frames, calls entity/component/channel
bindings, handles messages, and applies interpolation samples.

## Basic Loop

```ts
const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const interpolator = new AdaptiveInterpolator(client)
const replica = new ClientReplica(client, { interpolator })
await client.connect('ws://localhost:8079', handshake)

function frame() {
    const batch = replica.process({ maxFrames: 20 })
    const sample = replica.sampleInterpolated(100)
    replica.applyInterpolatedSample(sample)
    client.flush()
    requestAnimationFrame(frame)
}
```

`maxFrames` chunks catch-up work but never skips delta snapshots. If a client is
too far behind to process the backlog, reconnect rather than skipping frames.

## Flat Entities

Use `bindEntity` for ordinary replicated objects where the network entity is the
thing userland wants to track.

```ts
replica.bindEntity<PlayerEntity, PlayerView>(NType.Player, {
    mode: ClientEntityMode.Interpolated,
    create: entity => createPlayerView(entity),
    update(entity, view) {
        view.hp = entity.hp
    },
    sample(entity, view) {
        view.sprite.position.set(entity.x, entity.y)
    },
    destroy(view) {
        view.sprite.destroy()
    }
})
```

Raw and predicted bindings destroy immediately when the authoritative entity is
deleted or its channel closes. Interpolated bindings can remain alive until the
interpolation sample exits the entity, then `destroy` runs.

## ECS Components

Use `bindEcsComponent` for nengi ECS channels. The ECS root is a `pid`;
replicated state lives in component records with their own `nid`.

```ts
replica.bindEcsComponent<TransformComponent, TransformView>(NType.Transform, {
    mode: ClientEntityMode.Interpolated,
    create(component, ctx) {
        return createTransformView(ctx.pid, component)
    },
    sample(component, view, ctx) {
        view.pid = ctx.pid
        view.sprite.position.set(component.x, component.y)
    },
    destroy(view) {
        view.sprite.destroy()
    }
})
```

Use `ctx.pid` for the local ECS/root identity. Use `ctx.nid` or
`component.nid` only when code specifically needs the replicated component id,
such as prediction reconciliation or raw authoritative lookup.

Root lifecycle hooks are available when userland needs them:

```ts
replica.onEcsCreateEntity(pid => createLocalRootState(pid))
replica.onEcsDeleteEntity(pid => destroyLocalRootState(pid))
```

Visibility loss from a channel close destroys component bindings, but it is not
the same event as authoritative root deletion.

## Channel Context

Every channel has a default header. `channel.header.nid` is the channel id,
`channel.header.channelType` is a `ChannelType` enum value, and default header
`ntype` is `0`. A channel created with `name` also has `channel.header.name`.
Use schema-backed header objects when ordinary entities need richer channel
context, such as inventory items.

```ts
replica.bindChannel<InventoryHeader>(NType.InventoryHeader, {
    open: channel => openInventory(channel.header),
    update: channel => refreshInventoryHeader(channel.header),
    close: channel => closeInventory(channel.header.inventoryId)
})

replica.bindChannelEntity<InventoryHeader, InventoryItem>(NType.InventoryHeader, NType.InventoryItem, {
    mode: ClientEntityMode.Raw,
    create(item, ctx) {
        upsertInventoryItem(ctx.channel.header.inventoryId, item)
    },
    update(item, _local, ctx) {
        upsertInventoryItem(ctx.channel.header.inventoryId, item)
    },
    destroy(_local, ctx) {
        removeInventoryItem(ctx.nid)
    }
})
```

Use channel headers for game meaning. Treat raw channel ids as internal
bookkeeping.

## Messages

Immediate messages run after the frame's authoritative state is applied:

```ts
replica.onMessage(NType.YouArePlayer, message => {
    setControlledPlayer(message.pid, message.componentNid)
})
```

Interpolated messages are released on the interpolation timeline:

```ts
replica.onInterpolatedMessage(NType.ShotFired, message => {
    drawShot(message)
})
```

Use immediate messages for control/UI context and notifications. Use
interpolated messages for transient effects that should line up with
interpolated entity motion.
