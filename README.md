# nengi

Nengi is a TypeScript networking library for realtime multiplayer games. The
server owns authoritative state, clients send commands and requests, and nengi
replicates relevant state to each client through compact binary snapshots.

Nengi is renderer-agnostic and game-loop agnostic. Use it with canvas, Pixi,
Three.js, Babylon.js, custom WebGL/WebGPU renderers, or non-game realtime apps.
It does not own your physics, ECS scheduler, inventory system, renderer, UI, or
game rules.

## Install

```sh
npm install nengi@2.0.0-rc.127
```

This package exposes a root-only public API. The application-facing surface is
documented first; adapter and protocol implementation types are also exported
from the root for package authors and advanced integrations.

```ts
import { Channel2D, Client, Context, Instance, defineEntitySchema } from 'nengi'
```

Deep imports are not part of the public package contract. Follow the package
source and the AI-facing documentation when integrating Nengi.

## Core Model

- Entity: persistent replicated state with `nid`, `ntype`, and schema fields.
- Message: transient event payload.
- Command: client-to-server input stream.
- Request/response: client-to-server action that expects a result.
- Channel: server-side visibility and subscription container.
- Frame: client-side per-snapshot change report.

Use automatic channels when nengi can scan object state. Use manual channels
when game code already has reliable mutation points and wants explicit,
high-performance writes. Use ECS channels when the game models state as roots
and networked components.

Common channel choices:

- `Channel`: all subscribed users see all objects in the channel.
- `Channel2D` / `Channel3D`: spatial visibility.
- `ManualChannel` / `ManualChannel2D` / `ManualChannel3D`: explicit mutation
  writes.
- `EcsChannel` / `EcsChannel2D` / `EcsChannel3D`: ECS roots and replicated
  components.

## Client Shape

Clients receive snapshots, apply them to `EntityStore`, and drain `Frame`
objects:

```ts
for (const frame of client.network.drainFrames()) {
    frame.messages.forEach(handleMessage)

    for (const channel of frame.channels) {
        channel.createEntities.forEach(createPresentation)
        channel.updateEntities.forEach(updatePresentation)
        channel.deletedEntities.forEach(deletePresentation)
    }
}
```

Fast action games can use command prediction helpers and interpolation:

```ts
import { AdaptiveInterpolator, CommandReplayPrediction } from 'nengi'
```

Prediction reconciles against raw authoritative state. Interpolation samples
retained history for smooth rendering of non-predicted entities.

## Documentation

The AI-facing docs are the canonical guide to building with nengi. They are
self-contained and do not require another project:

- [AI guide](./docs/ai/README.md)
- [Channel selection](./docs/ai/channel-selection.md)
- [Networking primitives](./docs/ai/networking-primitives.md)
- [Plain channel client/server shape](./docs/ai/plain-channels.md)
- [ECS channel client/server shape](./docs/ai/ecs-channels.md)
- [Real-time movement prediction](./docs/ai/realtime-movement-prediction.md)
- [ECS world, resources, and query boundaries](./docs/ai/ecs-world.md)
- [Architecture and tick flow](./docs/ai/architecture-and-ticks.md)
- [Client state and presentation](./docs/ai/client-state.md)
- [Timing and connection liveness](./docs/ai/timing-and-liveness.md)
- [Network-condition simulation](./docs/ai/network-condition-simulation.md)
- [Service patterns](./docs/ai/service-patterns.md)
- [Testing and correctness](./docs/ai/testing-and-correctness.md)
- [Benchmarking and bot workloads](./docs/ai/benchmarking.md)
- [Operational safeguards](./docs/ai/operations.md)
- [Server network limits](./docs/ai/network-limits.md)
- [API surface and import tiers](./docs/ai/api-surface.md)

## Release Candidate Changelog

Changes after `2.0.0-rc.121`:

### 2.0.0-rc.127

Updating a demo or existing game? Start with the
[upgrade checklist](./docs/ai/migration.md) for application changes and validation.

- Fixed client ECS application when an existing component is replaced by a new
  component of the same type in one snapshot. The applier removes the old
  component before adding its replacement; client guidance also handles
  component-only presentation cleanup.
- Fixed bound ECS component removal for roots without a selected spatial
  component. Cleanup now works before spatial activation and after deactivation;
  writes still require a selected spatial component.
- **Invalid-input behavior change:** parent/child lifecycle operations reject
  copied objects carrying an active `nid`. Previously, detaching such a copy
  could release an id while leaving the real object registered. Pass the actual
  parent and child object references; valid lifecycle behavior is unchanged.
- The ECS client guide now handles transport disconnect explicitly, releasing
  applied roots and presentation resources without waiting for a channel-close
  frame, and starts the network loop only after connection acceptance.

- **Network-ID reuse:** destroyed entities and channel headers now release their
  diff baselines before their IDs become reusable. This prevents retained old
  state and snapshot errors when an ID is reassigned to a different schema.

- **Spatial ECS lifecycle:** selecting an existing component as spatial now
  correctly introduces its root even in an already-populated visible cell.
  Discarded pending writes are cleaned up once per flush in frames with component
  removals, avoiding repeated scans on each removal. For `EcsChannel2D` and
  `EcsChannel3D`, create roots before their components and let new objects survive
  their first snapshot. Same-tick creation and cancellation is outside the
  [fast-channel contract](./docs/ai/ecs-channels.md#mutation-responsibility).

- **Prediction and pause recovery:** replay helpers respect `affectedProps`;
  state replay ignores unrelated events and preserves pending changes across
  all of its properties. Default command correction now detects non-XY state
  differences too. Interpolation can rebuild an exhausted buffer by temporarily
  slowing forward playback. Review custom correction thresholds and the
  [movement loop](./docs/ai/realtime-movement-prediction.md#client-loop) when updating demos.

- **Client control validation:** server-only engine messages, pre-authentication
  gameplay controls, duplicate/non-advancing frame counters, duplicate/orphan
  timing and invalid timing numbers are rejected. Engine records and total
  packet sections are each capped at 512. Invalid clock samples cannot poison
  timing state or refresh liveness. The client now splits large engine batches
  and coalesces delay reports; gameplay command batches remain limited to 255.
- **Transport control validation:** all official server adapters reject text.
  ws/uWS/Bun budget native Ping/Pong callbacks using the existing traffic
  credits. Deno cannot expose these callbacks; deployment/native transport
  limits remain necessary. See the [control rules](./docs/ai/network-limits.md#engine-controls-and-transport-frames).

- **Enabled server budgets:** `InstanceOptions.limits` configures admission,
  per-connection packet/byte rates and bursts, retained input, lifecycle event
  capacity, and queued responses. Defaults allow 4,096 total / 256 pending
  connections and 64 KiB client-to-server packets. Read
  [network limits](./docs/ai/network-limits.md) before migrating traffic/load tests.
  Excess closes its sender; admission refusals use `onNetworkLimit` rather than
  filling the event queue. Existing admitted users retain lifecycle headroom.
  ws, uWS and Bun inherit the core packet cap for native receive limits. Bun and Deno
  refuse admission before WebSocket upgrade with HTTP 503.
- **Queue consumption:** use `next`, `dequeue`, `removeWhere` or `clear` for the
  server event queue; direct backing-array mutation bypasses accounting. Earlier
  valid closed-user commands stay charged until drained. Schema-backed responses
  now copy their schema fields when queued so later edits cannot change the
  retained response or its byte charge.
- **Transport security:** ws socket errors no longer escape as unhandled Node
  errors. Closed/failed sends clean up the user; uWS dropped sends now fail the
  session instead of silently losing committed snapshot deltas.
- **ws configuration changes:** incoming messages default to the core
  `maxPacketBytes` setting (64 KiB; previously 100 MiB), and queued bytes plus an outgoing payload default to a 4 MiB budget.
  Configure `maxPayloadLength` / `maxBufferedBytes` in the adapter constructor.
  Forwarded addresses require an explicit `trustProxy` callback for known peers;
  otherwise `remoteAddress` is the direct socket address.
- **Protocol change:** requests received before connection acceptance now close
  the connection, like early commands, instead of accumulating `NOT_OPEN`
  responses. Wait for successful connection before flushing requests.
- Initial handshake packets are fully decoded before `onConnect` runs. Malformed
  suffixes or duplicate handshakes no longer start application authentication.
  Packets arriving after logical disconnect are ignored before decoding, avoiding
  undeliverable error responses and repeated diagnostics on closed users.
- **Lifecycle change:** subscribe before calling `user.queueChannelMessage()` or
  `queueChannelInterpolatedMessage()`; calls without a current subscription are
  ignored. Unsubscribe, channel destruction and disconnect cancel unsent scoped
  messages so they cannot replay into a later subscription or reused channel ID.
  Stale unsubscribe calls on an old channel object no longer remove a replacement
  subscription with the same ID. Previously transmitted snapshots are unaffected.
- **Ordering fix:** channel-scoped messages queued to a user now preserve issue
  order instead of arriving backwards. This covers ordinary and interpolated
  messages across all nine channel types. No API change.
- Replaced obsolete sparse/non-overlap benchmark fixtures with supported
  channels and corrected combined timing percentiles to summarize matching ticks.
- Fixed duplicate automatic `Channel` updates when shared update fragments are
  enabled, and duplicate channel broadcasts when a user has multiple
  subscriptions. Each channel now collects its own broadcasts; ordinary plans
  defer updates to the shared fragment when that path is active. No API change.
- Simplified `bindEcsChannel` bookkeeping and reused the component list returned
  by `EcsWorld.removeEntity()`. Binding behavior and public APIs are unchanged.
- **Breaking:** removed legacy `Historian`; use selected facts in `Historian2D`
  or `Historian3D`, including scalar and flag history without geometry.
- **Breaking:** replaced endpoint-following `PublicPositionSmoother2D` with the
  optional `PublicPathSmoother2D`. It preserves queued turns, has bounded backlog
  handling, and makes teleport/reset explicit.
- Fixed stale replay expectations and superseded expectations in overlapping
  prediction groups. Reconciliation events now coalesce per entity.
- Fixed queued command view-time drift and Ping clock-offset bias from snapshot
  preparation. Documented frame-by-frame authority observation with unchanged
  confirmation and immediate render-duration action-game prediction.
- Added explicit transport-disconnect cleanup to the plain client guide and
  clarified interpolation sample Map iteration after a browser consumer exercise.
- **Breaking:** command confirmation is now explicit. After authoritative input
  handling and simulation, call `user.confirmCommandsThrough(K)` before
  `instance.step()`. Packet receipt and command routing never confirm input.
  `K` covers every received batch through that number, including rejected input;
  deferred simulations must retain the last completed batch boundary. Games
  without prediction also make this call to release client command history.
  Request-only services, snapshot delivery and connection liveness remain
  independent. See the [migration guide](./docs/ai/migration.md).
- Server `user.disconnect(reason)` now removes the user and subscriptions and
  purges unstarted requests before closing the transport, even if transport
  close delays or throws. If graceful close throws, core attempts the adapter’s
  hard termination once when available, preventing an invalid close reason from
  leaving an untracked socket open. Repeated close callbacks preserve the initial
  reason and produce one disconnect event.
- **Behavior change:** `CommandRouter` skips closed users and stops remaining
  handlers/commands if a handler disconnects its user. Its processed count
  excludes skipped commands. Demos with hand-written command loops must check
  `user.connectionState === UserConnectionState.Open` before each command,
  including commands collected earlier in the tick.
- Local and simulated-local close now notify the client once, reject pending
  requests, settle interrupted handshakes, and close both ends. Local disconnect
  callbacks run synchronously; demos should use them for client cleanup.
  Async request handlers still own cancellation and session-dependent effects.
  See the [request lifecycle guidance](./docs/ai/networking-primitives.md#disconnect-during-an-asynchronous-request).
- Client history pruning uses a private index of entity changes by tick to
  visit timelines whose records are expiring. Stationary entities retain their
  final state without repeated history-array allocation.
- Full interpolation sampling resolves adjacent frame states in one pass,
  avoiding two intermediate entity maps while preserving schema interpolation,
  teleport markers, and entity visibility timing.
- Added repeatable Node and Chromium client-history workloads covering sparse
  updates, dense movement, lifecycle churn, ECS components, and selective sampling.
- Corrected AI client snippets to clean up closed channels before applying
  replacements, with executable checks against the documented handlers. Clarified
  batched frame/store timing and authoritative assignment in ECS writer snippets.
- Preserved decoder type information when queued channel closes or entity
  deletions precede replacements, including reused IDs and schema-backed headers.
- Numeric array binary types now copy retained state, fixing missed in-place
  automatic-channel updates and mutable history/sample aliases. Default binary
  interpolation honors the type's clone function.
- Documented received client state as read-only and removed redundant update
  copies between frames and the authoritative store. Consolidated duplicated
  plain/ECS client snippets into their topic guides and corrected shared ECS
  factories to supply gameplay state to the binding.

### 2.0.0-rc.126

- Added deterministic, seeded duplex network-condition simulation with
  asymmetric latency, uniform jitter, periodic stalls, FIFO WebSocket ordering,
  manual clock advancement, live timers, runtime diagnostics, and injectable
  deterministic delay models.
- Added simulated local, browser WebSocket, and Node `ws` client adapters. The
  ordinary local and WebSocket adapters remain immediate and lightweight.
- Added AI guidance for deterministic protocol tests and live condition
  simulation.
- Client adapters now answer Pings with Pong-only control packets immediately
  after parsing snapshots, independently of application `client.flush()` and
  `requestAnimationFrame` cadence.
- Increased the default Pong timeout from 6 seconds to 15 seconds. A fully
  suspended runtime still times out; an active hidden client that continues
  processing network traffic remains connected.
- Fixed disconnected-user retention in server channels. Before emitting
  `UserDisconnected`, nengi now removes the user from every subscribed channel,
  including spatial views and per-user visibility caches.

### 2.0.0-rc.125

- Replaced per-snapshot `TimeSync` engine messages with mandatory snapshot
  `serverTimeMs` metadata.
- Renamed client frame timing fields to `serverTimeMs` and `receivedAtMs` to
  distinguish server and local clock domains.
- Added injectable monotonic clocks, client server-time estimates, and explicit
  clock-sync diagnostics.
- Made the injected `Instance` clock the only server network-time source;
  `instance.step()` no longer accepts a separate timestamp.
- Changed Pong payloads to identify recent server-owned Ping records rather than
  echoing server timestamps from the client.
- Added configurable Ping/Pong and initial-handshake deadlines with explicit
  disconnect reasons and immediate adapter termination support.
- Added handshake wire-version validation and made malformed snapshots fatal on
  clients.
- Defined pre-acceptance failures as `UserConnectionDenied`; only users already
  announced through `UserConnected` can emit `UserDisconnected`.
- Default interpolation remains client-local and arrival-buffered; it does not
  require synchronized server time.
- Added optional `bindEcsChannel(world, channel, { context })` for servers
  that maintain authoritative state in `EcsWorld` alongside an ECS channel.
- Added active-root queries to ECS channels.
- Added bound `mutate` and append-only `writer` namespaces.
- Local-only ECS components remain ordinary `EcsWorld` state and are not
  replicated.
- Updated AI guidance to prefer the binding for server ECS roots while
  retaining raw channel writers as a lower-level API.
- Added canonical architecture, service, testing, and bot-workload guidance to
  the AI manual.
- Pinned the core and official adapter family to `2.0.0-rc.125`.
- The timing cleanup is intentionally wire-incompatible with earlier RC builds;
  use matching core and adapter versions.
- Added clean package-family release verification and resumable npm publishing
  under the `rc` dist-tag.

### 2.0.0-rc.123

- Fixed channel id reuse across channel close/open lifecycles. If a channel id
  is reused before the next snapshot, nengi now preserves both the close and the
  open, applies the close before new channel creates on the client, and commits
  the server's known-channel state in close-then-open order. This prevents
  partial client application when large scoped channels such as puzzle or
  inventory channels are destroyed and recreated.

### 2.0.0-rc.122

- Tightened ECS channel close semantics. `applyEcsChannelClose` now removes the
  affected ECS root entity, including local-only client components, so network
  id reuse after a channel closes cannot collide with stale local ECS state.
- Added `beforeRemoveEntity` to ECS frame/close application so clients can
  destroy render objects, colliders, and other local resources before an ECS
  root is removed.
- Clarified connection handshake usage in the docs. `client.connect(target)`
  works without a payload, while `client.connect(target, handshake)` remains
  the path for auth tokens, selected characters, requested rooms, build checks,
  and other server-validated setup data.
- Removed handshake contents from the default `instance.onConnect` warning so
  accidental token logging is avoided.

## Status

Nengi is moving toward a release-candidate API. The root package exports are the
intended public surface for RC work.
