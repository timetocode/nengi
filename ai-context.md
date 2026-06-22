# nengi AI context

This document is for an AI or contributor entering nengi without the full design conversation. It is intentionally compact and opinionated. Prefer the existing code and tests over this document if they disagree.

## What nengi is

Nengi is a client/server TypeScript networking framework for games. Its core job is to replicate relevant authoritative server state to each client efficiently. The server owns truth. Clients receive snapshots containing entity creates, entity updates, entity deletes, messages, responses, and engine messages. Clients send commands and requests.

Nengi is built around a binary schema layer. Developers define how properties serialize, and nengi uses those schemas to write compact snapshots, compute entity diffs, and read data on the client.

The design target is long-running, high-performance JavaScript game servers: minimal hot paths, low allocation pressure, predictable lifecycle rules, and features that compose rather than a large game-specific framework.

## Main concepts

### Entities

Entities are persistent replicated objects. They have:

- `ntype`: the schema/type id
- `nid`: the network entity id
- schema-defined properties

Entity schemas are created with `defineEntitySchema`. The `ntype` and `nid` are envelope fields, not schema properties.

Entities are diffed frame-to-frame. If visible to a user for the first time, they are sent as creates. If already visible and changed, they are sent as updates. If no longer visible, their nid is sent as a delete.

Game code owns entity object lifetime. Nengi holds references for networking.

### Messages

Messages are transient server-to-client or client-to-server payloads. They are not persistent and do not have a hardcoded `nid`. Message schemas are created with `defineMessageSchema`. Messages carry `ntype` in the envelope only.

Use messages for one-off events that do not need persistent diffed state.

### Requests and responses

Requests are client-originated interactions that expect a response. They are useful for validation, prediction, and reconciliation around discrete actions, such as opening a chest, moving an item, toggling a switch, or starting an interaction.

Requests may use JSON payloads or binary payload schemas via endpoints. Expected domain failures should usually be normal responses, for example `{ accepted: false, reason }`. Handler errors become rejected request promises.

A good pattern is:

1. Client predicts or opens pending UI.
2. Client sends request.
3. Server validates.
4. Server mutates subscriptions/state.
5. Response returns correlation ids.
6. Normal snapshots deliver the resulting state.

Example: `OpenChest` returns `{ accepted: true, chestNid, inventoryNid }`; inventory entities arrive through create/update/delete snapshot sections.

### Commands

Commands are client-originated messages intended for the server. They do not inherently expect a response. Use them for steady streams or fire-and-forget inputs.

### Channels

Channels are server-side visibility/subscription containers. A user subscribed to a channel can see entities in that channel. Culled channels add per-user visibility checks.

Channels are not replicated entities. Do not turn channels into entities. Do not turn entities into channels.

Channels can have an optional `name` for simple client-visible context. The name is carried on the default channel header.

Channel helpers:

- `addEntity(entity)`
- `removeEntity(entity)`
- `subscribe(user)`
- `unsubscribe(user)`
- `unsubscribeAll()`
- `removeAllEntities()`
- `destroy()`

The current channel family is intentionally plural:

- `Channel`: automatic all-visible entity channel; scans visible entities against schemas.
- `ManualChannel`: all-visible entity channel where userland explicitly appends prop/group mutations.
- `Channel2D` / `Channel3D`: automatic grid-culled entity channels.
- `ManualChannel2D2D` / `ManualChannel2D3D`: grid-culled entity channels with explicit mutation logs per dirty cell.
- `EcsChannel`: manual ECS channel where roots are nids and replicated state lives on component entities.
- `EcsChannel2D` / `EcsChannel3D`: ECS channel where a selected spatial component places the root in the grid.

Manual means "userland tells nengi what changed." It is the fast path and intentionally does less validation in production. Debug options may add checks, but the default writer path should remain close to direct array appends.

Spatial circle/sphere views are coarse cell queries. They include occupied cells intersecting the circle/sphere; they do not filter every entity against the exact shape.

Users can be subscribed to multiple channels. The snapshot writer appends per-channel streams; it should not globally merge visibility or dedupe entities across channels in the hot path. Putting the same entity in multiple channels is treated as a userland mistake, not a production-path validation case.

Channel headers are client context sent before normal channel entities. Use `name` for simple named channels, and use schema-backed headers when the client needs to route scoped CRUD, such as inventories, team state, or remote map views. When a known channel closes, the client treats it as a channel close and purges contained entities instead of requiring individual delete events.

Channel messages have two delivery styles. Plain, manual, and non-spatial ECS channels store broadcast messages until the snapshot boundary and can share cached message fragments. Spatial channels evaluate the message against each subscribed user's current view immediately and queue the message directly on matching users.

### ECS channels

ECS channels use nengi's binary schema system, but they assume a narrower ECS shape than plain entity channels.

In plain `Channel`, an entity is a replicated object: it has an `nid`, an `ntype`, schema properties, and nengi can scan it for property diffs. In `EcsChannel`, the root "entity" is a network identity only. It is a stable `nid` that groups components; it is not an object with userland state for nengi to diff.

Replicated ECS state lives on component entities:

- A root has an `nid`.
- A component has its own `nid`, an `ntype`, schema properties, and a `pid` pointing at the root.
- Root creates/deletes are networked separately from component creates/deletes.
- Component updates are manual prop/group writes through `createComponentWriter`.

This ECS model is intentionally one root-to-components layer, not a general scene graph. It assumes each component instance is individually addressable over the network so nengi can send one changed component without sending the rest of the root's state.

Spatial ECS channels place roots in the grid through a chosen spatial component. The root still has no position by itself; `addSpatialComponent`, `setSpatialComponent`, or `updateSpatialComponent` tells the channel which component determines visibility.

Avoid treating ECS channels as a wrapper around normal nengi entities. The performance value comes from this different contract: roots are ids, components are the replicated records, and userland mutation points append the network log directly.

### Entity children

Entity children are cascading visibility references. If a parent entity is visible, its children become visible too. Children are not owned or destroyed by nengi as game objects. If userland removes a parent source and the child has no other source, nengi stops networking the child; it does not destroy the child object.

A child can remain networked if another source references it, such as another channel or another parent.

## Source graph model

Internally, `LocalState.sources` maps entity nid to source ids that keep the entity networked. Source ids can be channel ids or parent entity nids. This is a networking reference graph, not object ownership.

Important distinction:

- Channel source: visibility root for users.
- Parent entity source: visibility cascade from another entity.

The shared abstraction is "source references keep an entity networked," not "channels and entities are the same thing."

## Snapshot pipeline

The server snapshot path is intentionally pipeline-shaped:

1. Check visibility.
2. Collect creates, updates, deletes, messages, engine messages, and responses.
3. Count bytes.
4. Write the binary buffer.
5. Commit sent queues/responses.
6. Send to the user.

Prefer keeping these steps testable. Avoid burying visibility, diffing, counting, writing, and queue mutation in one opaque function.

Snapshot writing is now chunk-oriented: the envelope is written first, followed by channel-specific chunks and cached binary fragments. Specialized channels should prepare their own create/update/delete streams and let the top-level writer append them. This keeps channel performance work local and avoids reintroducing one giant merged snapshot plan.

## Client state model

The client applies snapshot diffs into one authoritative `EntityStore`. This store is the latest known server state for visible entities. Applied frames are compact per-snapshot change records: creates, updates with previous/value, deletes, messages, timestamps, and confirmed client ticks. They do not clone the full visible world every frame.

Use `client.network.drainFrames()` for raw queued frame consumption, such as ECS adapters or custom simulators. The old interpolator is intentionally minimal while the newer store/frame model evolves.

Messages and request responses should be dispatched after the full snapshot has been applied to the store. A response from a request that subscribed the user to a channel can therefore query entities created in the same snapshot.

## Ids and protocol widths

`nid` and `ntype` widths are protocol state. They start compact and grow when needed.

- `ntypeType` is derived from registered context schemas.
- `nidType` starts at `UInt8` and can grow to `UInt16` and `UInt32`.
- A protocol engine message communicates active widths to the client.
- Widths grow upward only.

Returned nids are deferred until the snapshot boundary. This prevents a destroyed entity's nid from being reused in the same server frame. After the allocator wraps, released ids can be reused, allowing games with small live entity counts to keep compact ids over long runtimes.

Channel ids currently share the nid pool because channels and entity parents both act as source ids. Do not split this casually; it is part of the source graph discussion.

## Schema helpers

Use explicit helpers:

```ts
defineEntitySchema(...)
defineMessageSchema(...)
definePayloadSchema(...)
```

Avoid reintroducing a generic `defineSchema` alias unless the project explicitly decides to restore it.

## Performance posture

Nengi should stay small and hot-path friendly.

Prefer:

- whole-byte writes over bit-level complexity
- deterministic, low-allocation loops
- explicit schema/envelope fields
- small composable primitives
- tests around invariants
- refactors that expose pipeline steps for testing

Avoid:

- broad metadata fields that do not power behavior
- features that imply ownership/lifecycle semantics without enforcing them
- large game-specific systems inside the engine
- hidden temporal decoder state unless necessary
- clever abstractions that obscure hot paths

## Design spirit

Nengi should provide a minimal set of expressive networking constructs that game developers compose into many game-specific patterns. It should not become an inventory system, ECS, world model, or UI state manager. It should make those systems easy to build.

When adding functionality, ask:

- Does this preserve the authoritative server model?
- Does this compose with entities, messages, requests, and channels?
- Does it keep the binary format and lifecycle rules predictable?
- Can it be tested at the pipeline/component level?
- Does it avoid unnecessary work in common per-frame paths?
- Is this a primitive or a game-specific policy?

When uncertain, prefer explicit examples and tests over new API surface.
