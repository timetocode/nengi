# nengi alpha branch notes

This branch is intentionally volatile. These notes are a light migration guide for alpha testers, not a complete changelog.

## Schema helpers

Schemas now distinguish entity, message, and payload envelopes.

```ts
defineEntitySchema({ x: Binary.Float32 })
defineMessageSchema({ text: Binary.String })
definePayloadSchema({ chestNid: Binary.UInt32 })
```

Entities carry `ntype` and `nid` in the network envelope. Messages carry `ntype` only. Payload schemas add no network fields and are useful for request/response bodies.

## Requests and responses

Requests support JSON payloads by default and binary payloads when an endpoint defines request/response schemas. A useful pattern is to let a request change subscriptions and return correlation ids, while regular snapshots deliver the resulting state.

Example shape:

```ts
instance.respond(OpenChest, ({ user, body }) => {
  chest.inventoryChannel.subscribe(user)
  return { accepted: true, chestNid: body.chestNid, inventoryNid: chest.inventory.nid }
})
```

The chest inventory entities then arrive through normal create/update/delete snapshot data.

## Channels

Channels remain server-side visibility/subscription containers. They now have small lifecycle helpers:

```ts
channel.unsubscribeAll()
channel.removeAllEntities()
channel.destroy()
```

Channels may also have an optional `label` for game tooling, debugging, logs, or tests. Nengi does not interpret it or send it over the network.

```ts
const inventory = new Channel(instance.localState, { label: 'chest:123:inventory' })
```

## Entity children

Entity children are cascading visibility references, not game-object ownership. If a parent is visible, its children are visible. If a child is also referenced by another source, it can remain networked after the parent source is removed. Game code still owns object lifetime.

## Client authoritative store

The client now applies snapshot diffs into a single authoritative `EntityStore`. Applied frames are compact per-snapshot change records and can be consumed with `client.network.drainFrames()`. Messages and request responses are dispatched after the snapshot state has been applied, so a response handler can query entities created by the same snapshot.

## Compact ids

`nid` and `ntype` widths are protocol state. They start small and grow when needed. Returned nids are deferred until the snapshot boundary, so a destroyed entity's nid is not reused in the same server frame. Long-running games with small live entity counts can keep compact ids because released ids are reused after the allocator wraps.
