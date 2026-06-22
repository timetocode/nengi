# GameEcsWorld Notes

`GameEcsWorld` is the candidate userland ECS for Nengi games on both server and
client. The current arena prototype uses it as the gameplay ECS while Nengi
channels remain responsible for replication, visibility, and binary snapshots.

## Current Shape

- Entities are numeric pids.
- Components are plain objects with `pid`, `ntype`, and optional `nid`.
- Networked components use nids and can be looked up by nid.
- Local gameplay components use local component types and can stay server-only or
  client-only.
- Queries operate on component composition.
- Cached queries require explicit `flushQueries()` after structural changes.
- Resources are supported directly by the ECS world.

## Useful Prototype Evidence

`wipnexamples/player-arena-agro` uses `GameEcsWorld` on both sides:

- The server keeps `EcsChannel2D` and `GameEcsWorld` synchronized through
  a small network adapter.
- The client applies channel-scoped ECS CRUD directly into `GameEcsWorld`.
- Gameplay systems query components directly and avoid generic replica wrappers.

This is a good direction for userland: decoded channel ECS data becomes game
state with a short, inspectable path.

## Release Candidate Concerns

- `add()` should remain strict. Adding a second component with the same `ntype`
  to one pid throws instead of replacing hidden state.
- If replacement is needed, add an explicit `replaceComponent()` API.
- Cached query staleness is a footgun. The explicit `flushQueries()` model needs
  clear docs and tests, or a more obvious cached-query API name.
- Client and server resource usage should converge on `GameEcsWorld.resource()`
  unless there is a concrete reason to keep a separate client resource map.
- The arena server's channel/ECS synchronization helper is useful enough to
  become a documented pattern or small library helper.

## Channel Direction

The desired snapshot model is:

1. `User` owns connection state, subscriptions, protocol/header knowledge, and
   global queues.
2. Channels own visibility state.
3. Snapshot creation appends channel-produced output to the buffer.
4. Legacy `User` visibility remains only for old channel implementations until
   those paths migrate.

Planned ECS spatial channels are the right first target because they already own
visibility and do not depend on `pendingVisibilityDeletes`.
