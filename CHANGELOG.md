# Release candidate changelog

Changes after `2.0.0-rc.121`:

### 2.0.0-rc.128

- Browser and Node WebSocket clients preserve the server's close reason when a
  flush or delayed simulated send races the native close event. Closing sockets
  discard outgoing data while the close callback settles the session; genuine
  write failures remain transport errors. No application or wire migration is
  required for this correction.

- Clients that manage their own interpolation/history can opt out of entity
  history with `ClientOptions.entityHistory: false`. Raw state, frame facts,
  requests and prediction remain available; nengi interpolators require history.
  Grouped update decoding also avoids temporary per-group arrays. See
  [client history options](./docs/ai/client-state.md#games-that-own-their-history)
  and [application tick headers](./docs/ai/channel-recipes.md#application-tick-per-publication).

- The package includes a complete non-predicting browser/Node starter, verified
  against the installed package family. Start with [getting started](./docs/ai/getting-started.md).
  Release history now lives here; the README and manual focus on current usage.

- Official packages now declare compatible core and binary-backend ranges. This
  baseline includes the new client/server adapter contracts; subsequent core
  releases do not require unchanged adapters to be republished. See
  [package compatibility](./docs/ai/package-compatibility.md).

- Plain ECS channels discard pending writes for removed components before
  snapshot fanout, including cancelled creates and new subscribers.
- Custom binary registrations reserve IDs below 1024 for nengi and reject
  duplicate IDs and invalid hooks. See the migration guide for existing custom types.

- Simulated transports preserve multi-byte typed-array payloads and keep failed
  copies out of queue counters and release scheduling. See
  [simulation migration](./docs/ai/migration.md#rc-128-simulated-transport-payload-copying).

- Historian grid queries and recording now bound cell work and fall back to
  retained-sample scans for large spans. Invalid grid settings fail clearly.
  See [historian migration](./docs/ai/migration.md#rc-128-bounded-historian-indexing).

- Client requests use Promises exclusively. `ReplaceQueued` replaces only unsent
  matching requests; sent actions retain their real results. Handler and response
  failures now have `instance.onRequestError` diagnostics, with bounded generic
  errors for invalid or individually oversized replies. See the
  [request migration](./docs/ai/migration.md#rc-128-request-completion-and-queued-replacement).

- Schema fingerprints reuse a registration-invalidated cache. Pre-acceptance
  packets default to an 8 KiB `maxHandshakeBytes` budget, checked before decoding.
  See the [handshake and schema migration](./docs/ai/migration.md#rc-128-handshake-budgets-and-schema-fingerprints)
  and the manual's connection/JSON request validation snippets.

- Outbound payloads and shared fragments check their written sizes before reuse
  or transmission. Failed snapshot steps retain an `InstanceStepError` and refuse
  further steps on that instance. See the
  [failure-contract migration](./docs/ai/migration.md#rc-128-snapshot-failure-contract-and-binary-size-checks).

- Corrected `Binary.String` byte counting for unpaired UTF-16 surrogates, preventing
  malformed packets and recipient disconnects. DataView reads now preserve a
  leading U+FEFF character consistently with Buffer reads. See
  [Unicode string migration](./docs/ai/migration.md#rc-128-unicode-strings).

- `instance.onConnect` can return `{ deny: detail }` for a deliberately public
  JSON refusal. Unexpected exceptions stay in server diagnostics and reach the
  client only as `{ reason: 'server_error' }`. Generic and engine denials now use
  structured reason codes. See the
  [migration guide](./docs/ai/migration.md#rc-128-public-connection-denials).

- `instance.onConnect(handshake, { user, signal })` can cancel abandoned setup
  and release reservations. The signal covers failures through acceptance;
  established sessions retain normal disconnect cleanup. Handshake deadlines
  also run at admission/authentication boundaries, including after setup encoding,
  so late authentication cannot bypass a timeout between server ticks. Timeout
  denial is sent when possible before closure. See
  [setup ownership](./docs/ai/networking-primitives.md#cancellation-and-setup-ownership)
  and [connection budgets](./docs/ai/timing-and-liveness.md#handshake-deadlines).

- Ordinary commands no longer retain an unused client history awaiting server
  confirmation. Games without command/state prediction need no confirmation
  call. Prediction keeps explicit game-owned confirmation and its existing replay,
  expected-state and optimistic request APIs. A configurable client diagnostic
  warns once about stalled command/state confirmation; see the
  [prediction guide](./docs/ai/realtime-movement-prediction.md#missing-or-delayed-confirmation).

- Server snapshot preparation reuses empty diff results and stable remembered
  cells, skips unused manual/ECS plans, and prepares ECS batches once for counting
  and writing. Automatic spatial channels also skip rebuilding unchanged visibility
  while continuing to detect property changes. Idle manual groups defer membership
  and merged-log construction until they encounter updates. Snapshot envelopes
  reuse immutable empty sections, and reporting-only statistics are collected
  only when enabled. Manual spatial cell fragments reuse live-membership filtering
  within the prepared plan's lifetime; writes, lifecycle changes and cleanup
  invalidate that reuse, including repeated preparation within one tick.
  Spatial channels share remembered per-cell ID lists across subscribers, retaining
  older versions until each subscriber advances. Empty spatial plans and cell
  comparison sets are deferred until needed. Binding property/group mutations
  use fewer temporary objects while preserving validation and failure restoration.
  Automatic Channel2D/3D views now retain their stable visibility path when roots
  cross cells or are added outside that view. Property changes remain automatic;
  root removal and child-tree edits still conservatively invalidate visibility.
  ManualChannel2D/3D now detect child attachment/removal even when
  their visible cell keys have not changed. Ordinary game APIs are unchanged.
- Interpolation avoids discarded property clones and repeated selected-history
  searches. Optional `sampleEntitiesInto` with an `InterpolationOutput` reuses
  presentation Maps and outer entities; existing sampling APIs retain independent
  results. See [output lifetime](./docs/ai/client-state.md#reusable-presentation-output).
- Plain Channel, ManualChannel and EcsChannel share membership snapshots and
  visibility comparisons across subscribers, avoiding repeated full-world copies
  and sets. Snapshot-helper collections are now borrowed and read-only; ordinary
  game mutation and subscription APIs are unchanged. See the
  [migration guide](./docs/ai/migration.md#rc-128-channel-snapshot-visibility).
- Connection setup explicitly separates server-local `serverData` (the
  `UserConnected` event payload) from optional JSON `clientData` (the `connect()`
  result). Return `true` to accept without data or `false` to deny. Existing
  server payloads must be wrapped in `serverData`. **Wire protocol version 2
  requires updating both peers.** See [migration](./docs/ai/migration.md#rc-128-connection-setup-data).
- Core now owns client connection lifecycle: `connect()` resolves with optional setup data
  on acceptance and otherwise rejects a structured `ClientConnectionError`.
  Read `client.connectionState`; use the disconnect handler for terminal outcomes
  after acceptance. Default connection/receive deadlines are 10/30 seconds,
  configurable through `ClientOptions`, with `null` as an explicit opt-out.
  Disconnect cleanup is synchronous, and attempt cancellation supports AbortSignal.
  Failed initial attempts can retry; ended sessions require a fresh Client.
  **Update the client adapter with core:** version 2 transport contracts replace
  adapter-owned handshake/flush policy. See the
  [migration guide](docs/ai/migration.md#rc-128-client-connection-lifecycle).
- Added `PublicPathSmoother3D` and atomic `enqueueRoute(waypoints)` to both path
  smoothers. Games can admit a complete collision route before committing raw
  movement. Existing 2D single-point enqueue behavior is unchanged.
- Server adapters expose terminal, idempotent `shutdown(reason?)`, including
  pending-handshake and accepted-user cleanup. Custom server adapters must
  implement this required method. Games still process disconnect events and
  save their own state; see [shutdown ownership](./docs/ai/adapters.md#server-shutdown).

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
  without prediction also needed this call in rc.127 to release client history;
  RC 128 removes that requirement. Request responses, snapshot delivery and
  connection liveness remain independent. See the [migration guide](./docs/ai/migration.md).
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
