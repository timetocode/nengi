# Networking primitives

Before choosing a channel, decide what kind of network data the feature needs.

## Entity

Use an entity for persistent replicated state.

Good fits:

- Player position.
- NPC state.
- Door open/closed state.
- Inventory item that should exist on the client while visible.
- Projectile or world object with state over multiple snapshots.

An entity has:

- `nid`: network id assigned by nengi.
- `ntype`: schema/type id.
- Schema properties.

Entities are created, updated, and deleted through snapshots. A newly subscribed user receives creates for visible entities.

## Message

Use a message for transient events.

Good fits:

- Chat line.
- Sound cue.
- Hit marker.
- Floating damage number.
- Short-lived notification.

Messages are not persistent. A user who was not subscribed or connected when the message was sent does not reconstruct that message later from state.

On the client, messages may be handled immediately or on the interpolation timeline:

```ts
router.onMessage(NType.YouArePlayer, message => setControlledPlayer(message.nid))
router.onInterpolatedMessage(NType.ShotFired, message => drawShot(message))
```

Use immediate messages for UI/control context, chat, notifications, and other logic that should run as soon as the snapshot is processed. Use interpolated messages for transient effects that should line up with interpolated entity motion, such as shots, impacts, casts, or sounds tied to moving entities.

## Command

Use a command for client-to-server input that does not inherently need a response.

Good fits:

- Movement input.
- Aim direction.
- Fire button.
- Repeated input stream.

Commands should be validated on the server. The authoritative result should usually appear later as entity state or messages.

## Request/response

Use request/response for client-originated interactions that need a result.

Good fits:

- Open a chest.
- Move an item between inventory slots.
- Buy an item.
- Accept a quest.
- Start crafting.

Pattern:

1. Client sends request.
2. Server validates.
3. Server mutates state or subscriptions.
4. Server responds with accepted/rejected data.
5. Normal snapshots deliver resulting entities/messages.

For expected game failures, prefer normal responses like `{ accepted: false, reason: 'too_far' }` rather than throwing.

## Channel

A channel answers "who can see these entities/messages?" It is not itself replicated state.

Use channels for visibility and subscription:

- World region.
- Team.
- Inventory.
- Container.
- Remote map.
- ECS world.

Do not create a channel merely because you need a replicated object. Create an entity for replicated state.

A channel may have an optional schema-backed `header`. Use a header when the client needs context for the entities arriving through that channel, such as "this is chest 123's inventory" or "this is the red team private channel." Headers are sent before normal channel entities and can be used with `router.channel(...)` for scoped CRUD.

When a headered channel closes, the client receives a channel close and purges entities that came through that channel. Userland should usually handle this with `router.channel(...).onClose(...)` instead of expecting individual delete handlers for every contained entity. The close context includes `ctx.closed.entityNids`, the complete list of purged network ids, for renderer or UI cleanup keyed by nid.

`ReplicaRouter` also supports global CRUD:

```ts
router.onCreate(NType.Player, createPlayerSprite)
router.onUpdate(NType.Player, updatePlayerState)
router.onDelete(NType.Player, destroyPlayerSprite)
```

Global and channel-scoped CRUD both fire if both are registered. The entity is stored once; duplicate side effects are userland's responsibility. Use global CRUD for cross-cutting behavior and channel CRUD when channel context matters.

## Schema

Schemas define how nengi serializes data. Register schemas in a shared `Context` used by both server and client.

Use:

```ts
defineEntitySchema(...)
defineMessageSchema(...)
definePayloadSchema(...)
```

Keep schema properties flat. Use ids or separate entities/components for relationships.

## Feature decision examples

Player movement:

- Client sends command input.
- Server simulates movement.
- Server replicates player entity or transform component.
- Use spatial channel if visibility is position-based.

Open chest:

- Client sends request.
- Server validates distance/permissions.
- Server subscribes user to chest inventory channel, which has an inventory header.
- Server response says accepted and may include ids.
- Snapshot creates the header first, then inventory item entities.

Explosion:

- Persistent area hazard: entity.
- One-time visual/sound event: message.
- Damage results: entity updates or messages depending on gameplay need.

Scoreboard:

- Persistent match score: entity in `Channel`.
- One-time "team scored" event: message.
