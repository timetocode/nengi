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

For discontinuous movement, call `channel.skipInterpolation(entity)` after
moving the entity on the server. This marks the next snapshot so the client
snaps to the new value instead of interpolating from the old position. Use it
for teleports, blinks, respawns, wraparound, and object-pool reuse.

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

Use ordinary messages for UI/control context, chat, notifications, and other
logic that should run after the snapshot's authoritative state has been applied.
Use interpolated messages for transient effects that should line up with
interpolated entity motion, such as shots, impacts, casts, or sounds tied to
moving entities.

Server APIs:

```ts
channel.addMessage(message)
user.queueMessage(message)

channel.addInterpolatedMessage(message)
user.queueInterpolatedMessage(message)
```

These are separate lanes. Do not send the same side effect through both unless
duplicate client handling is intentional.

## Command

Use a command for client-to-server input that does not inherently need a response.

Good fits:

- Movement input.
- Aim direction.
- Fire button.
- Repeated input stream.

Commands should be validated on the server. The authoritative result should usually appear later as entity state or messages.

For movement commands, define a clear cadence. Either send movement commands at
a fixed client command rate, or include enough timing/input information for the
server to simulate a bounded amount of time. Do not accidentally make movement
speed depend on browser render frame rate by sending one command per
`requestAnimationFrame` and applying a fixed movement step per command.

For commands that need server-side lag compensation, use
`client.addCommandWithTiming(command, options)` or
`client.predictCommandWithTiming(command, predictionOptions, timingOptions)`.
The timing metadata lets server code use `getCommandViewTimeMs(...)` to query a
historian around what the client was viewing when the command was authored.

Use `CommandRouter` on the server when a game has several command types and the
raw `event.commands` loop becomes repetitive:

```ts
const commands = new CommandRouter()

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    movePlayer(user, command)
})

commands.on<GatherCommand>(NType.GatherCommand, ({ user, command }) => {
    gatherResource(user, command)
})

commands.process(event)
```

`CommandRouter` does not change command semantics. It only dispatches received
commands by `ntype` in their original order.

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

Requests do not have to own the resulting state. In many game features, a
request is only the validated transaction boundary. The durable result then
arrives through normal entities, messages, or channel subscription changes. For
example, moving an inventory item is usually a request, while the item records
inside the open inventory channels are still entities. The client UI can also
keep local-only state such as drag position, selected slot, pending/open/denied
status, or optimistic visual feedback.

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

A channel has an internal channel id, allocated from the same compact id space as
entities for binary encoding. Every channel also has a replicated header
descriptor. The descriptor's `nid` is the channel id, and `channelType` is one
of nengi's `ChannelType` enum values.

On the client, use `ctx.channel.header` inside `ClientReplica` channel bindings.
Default headers carry channel id/type metadata, and include `name` when the
server creates the channel with `name`. Use a schema-backed header object when
the client needs structured channel context, such as inventory id, owner id,
slot count, team id, or terminal mode. Schema-backed header data is sent with
channel open before normal channel entities and can be used with
`bindChannel(...)` and `bindChannelEntity(...)` for scoped CRUD. Choose the
header when creating the channel; mutate schema-backed header fields later and
call `markHeaderDirty()` when those fields should replicate.

Treat `name` as simple creation-time metadata, not mutable game state. The
server mutates the schema-backed header object you pass in; it is not cloned on
channel creation.

When a channel closes, the client receives a channel close and purges entities
that came through that channel. The server does not send a full per-entity
delete list for the close; the client derives the purged ids from local channel
membership. Userland should usually handle this with `bindChannel(...).close`
instead of expecting individual delete handlers for every contained entity.
Entity destroy callbacks also receive close context when local cleanup is keyed
by entity nid.

`ClientReplica` supports flat entity bindings:

```ts
replica.bindEntity(NType.Player, playerBinding)
```

It also supports channel-scoped entity bindings:

```ts
replica.bindChannelEntity(NType.InventoryView, NType.InventoryItem, inventoryItemBinding)
```

Use flat bindings when type alone is enough and channel bindings when channel
context matters.

## Schema

Schemas define how nengi serializes data. Register schemas in a shared `Context` used by both server and client.

Use:

```ts
defineEntitySchema(...)
defineMessageSchema(...)
definePayloadSchema(...)
```

Keep schema properties flat. Use ids or separate entities/components for relationships.

## Parent/child entities

Plain nengi entities can have parent/child relationships through
`Instance.attachChild(parent, child)`. This is a visibility cascade in the normal
entity model: when the parent is visible, its children become visible too.
Creates are parent-first and deletes are child-first. This is useful for
scenegraph-like objects or objects with replicated parts.

Parent/child entities are not the ECS channel model. In nengi ECS channels, a
root is only an id and replicated state lives on component entities with `pid`.

## Feature decision examples

Simple private inventory counters:

- If the inventory is just counts like wood, stone, gold, ammo, or berries, a private message can be enough.
- The server owns the real counts.
- Send the current counts to the owning user when they change.
- Do not create an inventory channel unless the inventory needs entity lifecycle, item metadata, multiple viewers, slots, drag/drop, or container context.

Open/shared inventory:

- If items need create/update/delete lifecycle, use a `Channel` with a header.
- If multiple users can view the same container, subscribe all authorized users to that channel.
- Use request/response for item moves so the server can accept or reject the transaction.

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
- Snapshot opens the channel with its header, then creates inventory item entities.

Explosion:

- Persistent area hazard: entity.
- One-time visual/sound event: message.
- Damage results: entity updates or messages depending on gameplay need.

Scoreboard:

- Persistent match score: entity in `Channel`.
- One-time "team scored" event: message.
