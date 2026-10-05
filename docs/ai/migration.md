# Updating an existing game

This guide covers upgrading to **2.0.0-rc.128**, including changes introduced
in **2.0.0-rc.127** for games upgrading from an earlier release.
For predicting games upgrading from RC-126 or earlier, the main required change
is explicit command confirmation on the server. RC-127 also required it for
ordinary commands; RC 128 removes that obligation. Also review the enabled
network limits and, if used, the retired historian/smoother APIs and prediction
callback changes below.

Use compatible core, binary backend and adapter versions as described below.
Update client and server core together during the RC transition, rebuild browser
bundles, and redeploy cached assets. The [changelog](../../CHANGELOG.md) records the
release history; this page collects the application changes to review.

## Moving from local tarballs to npm

In each application's `package.json`, replace official nengi-family `file:`
archive dependencies with `"2.0.0-rc.128"`, keeping each package in its existing
`dependencies` or `devDependencies` group. Include directly pinned binary backends
as well as core and transports, then run `npm install` and commit the updated
manifest and lockfile. Use `npm ls` to check that the installed family has no
invalid peer dependencies or unexpected older copies.

Restart servers and development clients, rebuild browser assets, and refresh
bundler dependency caches when replacing a same-version local candidate. For
Vite, restart with `--force`. Upgrade both network peers together. Private local
builds labeled rc.127 or rc.128 can contain different code despite those labels;
review the relevant API migrations below.

The separate `@nengi/collections-experimental` pilot is not part of this release.
A game using it must manage that dependency separately; publishing core does not
publish or upgrade the pilot.

## RC 128: independent package versions

The new baseline is `2.0.0-rc.128`. Upgrade the official adapters and binary
backends when moving from rc.127 to this baseline, because the transport APIs
have changed. Thereafter, core, each transport adapter and each binary backend
have independent release schedules. Their package numbers do not need to match.

Adapters declare a supported core range through `peerDependencies.nengi`;
transports also declare compatible binary-backend dependencies. The initial
range is `>=2.0.0-rc.128 <2.0.0`. Keep the application's lockfile and let npm check
the graph; do not use `--force` or `--legacy-peer-deps` to bypass a mismatch.

Contract versions are separate from package versions and the client/server wire
protocol. An incompatible transport fails at setup. See
[package compatibility](./package-compatibility.md) and the
[installation combinations](./adapters.md#package-compatibility).

## RC 128: public API and server adapter contract

Server adapter construction now uses `instance.adapterHost`:

```ts
const adapter = new WsInstanceAdapter(instance.adapterHost)
```

This applies to ws, uWS, Bun, Deno, local and simulated-local server adapters.
Custom adapters implement contract version 1 and use `host.createConnection(...)`
instead of `new User(...)`; read the [transport contract](./adapters.md#server-adapter-contract-version-1).
Update core and adapters together for this boundary change. It does not change
the wire format.

`User`, `ClientNetwork` and `InstanceNetwork` are type-only root exports. Replace
manual construction with normal connection lifecycles; use local adapters for
in-memory tests. Keep `UserConnectionState` checks in gameplay, including after
asynchronous work. State, identity, timing and confirmation observations are now
read-only in published declarations.

Replace these internal accesses:

| Previous access | Supported replacement |
| --- | --- |
| `instance.network.pendingUsers.size` | `instance.network.getPendingConnectionCount()` |
| Command/request/response queue counters | `instance.network.getQueueStats()` for a copied diagnostic sample |
| `client.network.outbound` to discover the next command index | Capture `client.network.commandFrameNumber` and the index returned by `client.addCommand(...)` or `addCommandWithTiming(...)` |
| `client.network` enqueue/request/flush methods | The corresponding `Client` methods |
| Mutating `instance.users` or `instance.queue.arr` | Normal connection/disconnection and queue consumption methods |
| Mutating `client.network.frames` or `latestFrame` | Consume arrivals through `processNextFrame` or `drainFrames`; keep application history separately if needed |
| `EngineMessage`, `BinarySection`, wire ID helpers | Use commands, requests, message queues and adapters; these engine encoders are internal |

History, interpolation, clock observations, schema fingerprints, performance
controls and prediction helpers remain supported. Code that ignores the return
value of `addCommand` requires no change. Prediction operation return values are
unchanged. See [the supported surface](./api-surface.md#engine-owned-state).


## RC 128: ECS removal and custom binary registration

Plain `EcsChannel` now removes pending manual writes for removed components once
before building subscriber snapshots. This contains orphan updates after a
cancelled create and when a new user subscribes after an older component was
removed. Continue creating roots before components and keep newly added state
through its first snapshot. Raw writer handles must not be used after removal.
No wire or adapter change is required for this fix.

Custom binary IDs must now be safe integers at least 1024. Use the exported
`CUSTOM_BINARY_TYPE_START` as the beginning of the application-owned range;
`Binary.LAST_INDEX` is not a custom-ID allocation rule. Reassign existing custom
registrations below 1024 to IDs at or above 1024, and update both server and client
definitions together.
Built-in IDs and encodings are unchanged.

Register custom types once in shared module setup, before schemas or connections.
Duplicate registrations now throw, including attempts to reinstall the same
specification. Required and optional hooks are validated as functions during
registration. `declareBinaryType` now returns the registered value for use in
schemas. See [custom binary types](./shared-state.md#custom-binary-types).

## RC 128: Simulated transport payload copying

Network-condition simulation now preserves the bytes of multi-byte typed-array
transport payloads, including BigInt views and subarrays. A failed copy no
longer changes the direction's enqueue counter or imposes a delay on later
traffic. Standard Buffer, ArrayBuffer and DataView payloads retain their behavior.
This fixes copying of serialized transport buffers, not schema array fields.
No application, wire-format or adapter migration is required. See
[network simulation](./network-condition-simulation.md).

## RC 128: Bounded historian indexing

`Historian2D` and `Historian3D` now fall back to scanning retained samples when a
query covers too many cells or a frame would need too many index entries. This
keeps large rays and hitboxes from expanding grid work without bound. History
and hit tests are preserved. Do not depend on circle/sphere/AABB result ordering
or the order of equal-distance ray hits. No wire or adapter changes are needed.

Grid settings must specify `{ type: 'grid', cellSize }` with a finite positive
size. NaN, infinity, zero, negative sizes and incomplete grid settings now throw
at construction. Positive sizes below 1 still use the existing minimum of 1.
Continue validating client aim and limiting rays to the server's weapon range;
bounded index work is separate from gameplay validation and numerical precision.
See [the historian guide](./historian-lag-compensation.md).

## RC 128: Request completion and queued replacement

Client requests now have one result API:
`client.request(endpoint, payload, options?)` returns a Promise. Remove both the
third-argument success function and `options.callback`; these forms fail clearly
in JavaScript and no longer typecheck. Use `await` with `try/catch`, or a Promise
chain with rejection handling. Server `send` handlers remain supported. Promise
observers run asynchronously after frame application and prediction reconciliation;
they do not run inline in the response-processing loop.

Rename `RequestPolicy.Replace` to `RequestPolicy.ReplaceQueued`. It now replaces
only matching requests still queued for outbound transmission, rejecting them
with `REPLACED`. Sent requests retain their real outcomes. Every-press toggle
actions should normally use `Allow`; latest desired state can use `ReplaceQueued`.
`Dedupe` still shares an outstanding Promise, including after sending. Handle
replacement rejection, and do not treat timeout/disconnect as server cancellation.

Add `instance.onRequestError` for local diagnostics. Bad response encoding and
individual replies too large for an empty output budget now return generic
`RESPONSE_ENCODING_ERROR` / `RESPONSE_TOO_LARGE` request errors when possible.
Fallback replies still obey queue limits. The action may already have run; these
are delivery/handler faults, not gameplay denials or permission to retry blindly.
Aggregate output pressure still closes the affected user. A forgotten handler
return can still time out because retaining `send` is valid deliberate deferral.

No wire format, adapter or version changes are required for these fixes. See
[request semantics](./networking-primitives.md#client-results-and-queued-intent)
and [server diagnostics](./operations.md#request-failures).

## RC 128: Handshake budgets and schema fingerprints

Packets received before acceptance now default to an 8 KiB ceiling through
`limits.maxHandshakeBytes`. This counts the complete packet, including JSON and
wire metadata, and rejects oversize input before decoding. Applications with a
deliberately larger setup payload can raise it explicitly, such as
`limits: { maxHandshakeBytes: 16 * 1024 }`. The existing `maxPacketBytes` limit
also applies; accepted clients retain that limit. No wire or adapter changes
are required. See [handshake budgets](./network-limits.md#handshake-input).

Schema fingerprints are cached. Register schemas and endpoint definitions through
`Context.register` and `Context.registerEndpoint` during setup; those methods
invalidate the cache. Registration maps are now read-only inspection views in
TypeScript. Direct map writes and mutation of registered schema or endpoint
metadata are unsupported. Use new definitions and a new context for a changed
protocol; changing registrations does not renegotiate existing connections.
See [fingerprint ownership](./operations.md#schema-fingerprints).

## RC 128: Snapshot failure contract and binary size checks

Treat `InstanceStepError` as terminal for that instance. It preserves the original
error in `cause` and is available through `instance.failure`; later `step()` calls
rethrow it without advancing replication. Stop the game loop, shut down its
adapters, clean up game resources, and create a fresh instance before restarting.
Remove catch-and-continue loops around snapshot failures. Fixing the offending
value alone cannot repair already-advanced replication bookkeeping.

Size checks now reject mismatched outbound buffers and shared fragments before
they are cached or sent. Custom binary backends must expose a numeric writer
`offset`, starting at zero, and an exactly sized `payload`. Official backends
already do this. No wire-format or schema changes are required.
See [failure handling](./operations.md#snapshot-step-failures) and
[binary backend requirements](./adapters.md#binary-boundary).

## RC 128: Unicode strings

Unpaired UTF-16 surrogates in `Binary.String` no longer corrupt packet sizes or
disconnect recipients. They encode as U+FFFD, matching both existing UTF-8 writers.
The DataView reader now preserves a leading U+FEFF character, matching the Buffer
reader. Update `nengi` and `nengi-dataviews` together and rebuild browser bundles
to receive both corrections. No schema/API changes or wire-version bump are needed.
See [string values](./shared-state.md#string-values).

## RC 128: Public connection denials

Expected public refusals now use `return { deny: detail }` from `instance.onConnect`:

```ts
if (account.banned) {
    return { deny: { reason: 'banned' } }
}
```

The client receives that JSON value in `ClientConnectionError.detail` with
`code: 'CONNECTION_DENIED'`. `return false` now produces
`detail: { reason: 'connection_denied' }`. Stop throwing exceptions to send public
refusal text: unexpected exceptions and invalid setup/denial data now produce
only `{ reason: 'server_error' }` on the client. The original error remains in the
server's `UserConnectionDenied` payload and the attempt's abort reason.

Engine wire/schema refusals use structured `reason` codes and version/fingerprint
fields instead of Error name/message strings. The handshake timeout detail is
unchanged. Update clients that inspected `detail.message` or `detail.name`.
See [public denial data](./networking-primitives.md#public-connection-denials).
This change needs no additional wire or adapter-contract version bump.

## RC 128: Connection setup data

`instance.onConnect(handshake, { user, signal })` now supplies a cancellation
context. One-argument handlers still work. Use the signal for abandoned setup
and retain cleanup until acceptance succeeds, including encoding/send failures
after returning an acceptance object. After successful acceptance, use the
normal connected/disconnected events; the signal is only for the pending attempt.
See [setup ownership](./networking-primitives.md#cancellation-and-setup-ownership).

Handshake expiry is enforced at admission and authentication boundaries as well
as during steps. Late authentication can no longer be accepted between sweeps.
Timeout denial reaches the client when transport delivery permits it; do not rely
on receiving the reason before closure. Review both server and client
[connection budgets](./timing-and-liveness.md#handshake-deadlines).
These corrections require no additional wire or adapter-contract version change.

`instance.onConnect` now returns `false` or `{ deny: detail }` to deny, `true` to
accept without data, or `{ serverData?, clientData? }` to accept with setup data.
Both acceptance fields are optional. Wrap any old server-local return value in
`serverData`:

```ts
instance.onConnect = async handshake => {
    const character = await authenticateAndLoadCharacter(handshake)
    if (!character) return false
    return {
        serverData: { character },
        clientData: { characterId: character.id, characterName: character.name }
    }
}
```

`serverData` is still available by reference as the server's `UserConnected`
`event.payload`. Only JSON-serializable `clientData` is sent to the client.
`connect<Setup>(...)` resolves to `Setup | undefined`; an untyped call returns
`unknown`. Omitting client data resolves to `undefined`, and failures still reject.
Handlers that returned arbitrary values (including implicit `undefined`) must be
updated. `true`, `false`, and `{}` remain supported; accepting without data no
longer puts the acceptance boolean/object into `event.payload`.

**The wire protocol is now version 2. Update both peers and rebuild browser bundles.**
Version 1 peers cannot connect to this build. The version 2 client transport
adapter contract is unchanged; these are separate version numbers.

Acceptance waits for asynchronous `onConnect` work, but does not wait for the
server game loop to spawn the player or for the client to receive a snapshot.
See [connection setup](./networking-primitives.md#connection-handshake).

## RC 128: Client connection lifecycle

**Update core and the client adapter together.** Client adapters now use transport
contract version 2. Custom adapters take `config?` and implement
`open(target, handlers)`, `send(payload)`, and `close(reason, force)` with
`clientAdapterVersion = 2`. Core owns handshake, deadlines and notifications.
The separate connection-setup change above versions the wire protocol.

Application migration:

| Previous use | Replacement |
| --- | --- |
| `const result = await client.connect(...)`, then `result.accepted` | `await client.connect(...)`; it resolves with optional application setup data or rejects a `ClientConnectionError`. The result is not a success/failure envelope. |
| `client.adapter.connected` or socket `readyState` for gameplay | Read `client.connectionState`: `idle`, `connecting`, `connected`, `closed`. |
| `setWebsocketErrorHandler` or `network.onMalformedSnapshot` | Catch the connect Promise for initial failure; use `setDisconnectHandler(info => ...)` after acceptance. Read `info.code`, `info.detail`, `info.cause`. |
| Queuing commands/requests/predictions before acceptance | Wait until connected; invalid-state calls now throw without queuing work. |
| Waiting for the close event to stop the game loop | `disconnect()` performs logical cleanup and invokes the established-session handler synchronously. Make teardown reentrant and idempotent. |
| Arbitrary disconnect detail forwarded to the peer | Detail stays local; a short standard close code travels over the transport. Send required application data explicitly before leaving. |
| `WsClientAdapter.stats.snapshotsReceived` | `stats.messagesReceived`, counting binary transport messages including the handshake. |

The fifth Client constructor argument adds `connectTimeoutMs` (default 10000) and
`serverTimeoutMs` (default 30000). The first covers the full opening/acceptance
attempt; the second measures valid inbound nengi traffic independently of the game
loop. Use a positive finite duration or `null` to disable. A server that deliberately
stops all publication must adjust that policy or continue idle network steps.

Use `connect(target, handshake, { signal })` to cancel an initial attempt.
`disconnect()` while connecting also cancels. Denied, failed, cancelled or timed-out
initial attempts return to `idle` and can retry on the same Client. There is no
initial-failure disconnect callback. Once accepted, all later `connect()` calls
reject; after disconnect create a fresh Client and session-bound helpers.

Teardown rejects pending requests with `DISCONNECTED`, discards unsent commands
and queued frames, and cancels pending predictions without reconciliation callbacks.
Request failure means the server outcome may be unknown. Last applied state and
history remain readable. Do not rely on old queues surviving a connection loss.
See [connection lifetime](./client-state.md#connection-lifetime),
[deadlines](./timing-and-liveness.md#client-deadlines), and
[adapter responsibilities](./adapters.md#adapter-contracts) for the full contract.

## RC 128: Public paths and server shutdown

`PublicPathSmoother3D` now provides the XYZ equivalent of `PublicPathSmoother2D`.
Both expose `enqueueRoute(waypoints)` for atomic admission of a complete command
route. The existing 2D single-point API is unchanged. Replace game-owned 3D
copies where suitable, preserving the game's speed, catch-up and backlog limits.
See [public paths](./realtime-movement-prediction.md#public-path-smoothing).

Official server adapters now expose `shutdown(reason?): Promise<void>` for the
listener and its users. Replace native `adapter.server.close()` / `app.close()`
workarounds with this method, then process game lifecycle events and save state.
Bun/Deno `close()` remains an alias. Shutdown is terminal; use a new adapter to
listen again. **Custom server adapters must implement the new required method**
and call `host.shutdownAdapter(this, reason)` before closing their resources.
See [shutdown ownership](./adapters.md#server-shutdown).

## RC 128: Interpolation sampling

Sampling now constructs each property's final value directly, avoiding discarded
vector/array copies and repeated schema lookups. Selected sampling also uses the
existing single-search history path. This applies to the fixed, static and
adaptive interpolators. Existing allocating APIs need no migration: they still
return independent Maps, entities and mutable values, and earlier samples remain
valid.

The optional `sampleEntitiesInto(nids, output, interpDelay, now?)` API overwrites
a caller-retained `InterpolationOutput`. Allocate the buffer once per presentation
consumer; treat it as current display state, not a saved snapshot. Its Map and
compatible outer entities are reused, while mutable properties retain their
independent copy behavior. See [reusable output](./client-state.md#reusable-presentation-output)
before replacing calls that retain sample references or depend on selection order.

## RC 128: Channel snapshot visibility

Plain Channel, ManualChannel, and EcsChannel now share unchanged membership and
visibility comparisons among subscribers. Snapshot-collection helpers return
borrowed, read-only arrays and sets; copy a collection before modifying it. The
TypeScript result types express this ownership. Normal entity mutation, component
writers and channel subscriptions need no migration. Each subscriber still commits
its own visibility after its snapshot is successfully encoded; a server send failure
still disconnects that user rather than retrying an already committed snapshot.

Server snapshot preparation also avoids repeated empty spatial scans, unchanged
diff containers, unused manual/ECS plans and duplicate ECS batch preparation.
Internal `EntityCache` diff collections are borrowed, read-only results; do not
modify them. Ordinary channel and writer usage needs no migration. ManualChannel2D
and ManualChannel3D now correctly replicate children attached or detached after
their parent became visible, even when the visible cell keys stay the same.

Channel2D/3D reuse their existing stable-cell check to skip unchanged visibility
preparation. Property changes, including in-place edits to mutable values, are
still detected automatically. Membership changes use the ordinary lifecycle path;
the game still updates the spatial index through the existing channel API.

Snapshot envelopes now reuse immutable empty sections. Manual spatial fragments
reuse membership filtering within an existing prepared plan; writes, structural
changes, hierarchy changes and cleanup invalidate the plan, and protocol-width
changes rebuild the encoded fragment. This also fixes stale payload reuse when
snapshots are prepared again after a write within the same tick.

Channel2D/3D and ManualChannel2D/3D also share remembered per-cell ID lists among
subscribers. Their low-level `getRememberedCellNids(userId, key)` result is now
typed `readonly number[]`: treat it as borrowed and copy it before editing. Older
lists remain intact while other subscribers advance. Cell recreation and hierarchy
changes invalidate the shared result. Normal game code needs no new bookkeeping.
Binding `mutate.props` and `mutate.groups` retain their existing APIs, target checks
and value restoration if emission throws; they now construct fewer temporaries.

For integrations inspecting the low-level `channel.createSnapshotOutput()` result,
`stats` is now `null` unless `instance.network.snapshotPerformanceEnabled` is
enabled before snapshot preparation. Normal replication needs no change. Enabled
snapshot metrics retain their counters; disabled metrics avoid reporting-only
objects and grouped-property scans.

## Server input and connection lifecycle

| Existing pattern | Required review |
| --- | --- |
| Large client packets or synthetic input bursts | Configure finite `InstanceOptions.limits` for the workload. The default client-to-server packet cap is 64 KiB; it does not cap outgoing snapshots. |
| Custom WebSocket receive limits | Native and core limits both apply. Raising one does not raise the other. |
| Reading forwarded IP headers through ws | Configure `trustProxy` for known direct proxy peers. Otherwise `remoteAddress` is the direct peer address. |
| Direct edits to `instance.queue.arr` | Consume events through `next`, `dequeue`, `removeWhere` or `clear` so retained-input accounting is released. |
| Hand-written command loops | Check `user.connectionState === UserConnectionState.Open` before each command, including commands queued before disconnect. `CommandRouter` handles this check. |
| Ordinary commands without command/state prediction | No confirmation call is needed. Sent commands are no longer retained awaiting confirmation. Existing calls may remain if the application uses the completion boundary. |
| Command/state prediction | Call `user.confirmCommandsThrough(K)` after authoritative handling and before `instance.step()`. Confirmation remains explicit; pending predictions are retained for replay and expected-state reconciliation. |
| Predicted commands deferred across snapshots | Retain each batch number and confirm only the completed prefix after integration. Never use the latest received number to skip unfinished input. Requests retain their separate completion mechanism. |
| Requests or commands flushed during connection setup | Wait for `client.connect()` to resolve. Gameplay packets before acceptance close the connection. |
| Async request handlers | Recheck the user's connection before session-dependent effects after an await. Application work and cancellation remain game-owned. |

See [network limits](./network-limits.md),
[request and disconnect handling](./networking-primitives.md#disconnect-during-an-asynchronous-request),
and [operations](./operations.md) for defaults, diagnostics and transport details.

Server `user.disconnect()` performs logical cleanup immediately. Do not depend
on subscriptions or unstarted requests surviving until the native socket finishes
closing. Earlier command events can remain in the event queue, so drain them
normally and apply the connection check above. Local and simulated-local client
disconnect callbacks can run synchronously inside a disconnect call.

For a predicting game's synchronous loop that fully drains commands and finishes
their simulation without yielding, add this immediately before `instance.step()`:

```ts
for (const user of instance.users.values()) {
    user.confirmCommandsThrough(user.lastReceivedCommandFrameNumber)
}
```

This also covers empty flushes after completed input. Deferred simulations must
pass the last fully completed batch number instead. Confirmation is cumulative;
it includes deliberate rejections and does not imply every action succeeded.
Games without command/state prediction continue to receive responses and state
without it. Request predictions are resolved by responses, not command confirmation.

RC 128 removes the unused `Outbound.unconfirmedCommands` history and
its accessors; integrations must not use these internals as a replay queue. The
supported prediction APIs retain their own log. A new diagnostic warns once when
a sent command/state prediction stays unconfirmed across received snapshots for
two seconds. `ClientOptions.predictionWarningAfterMs` accepts a positive finite
duration or `null` to disable it for deliberately longer deferral. See
[prediction diagnostics](./realtime-movement-prediction.md#missing-or-delayed-confirmation).

## Scoped messages

Subscribe a user before calling `queueChannelMessage` or
`queueChannelInterpolatedMessage`. An unsubscribed call is ignored. Unsubscribe,
channel destruction and disconnect cancel unsent scoped messages; they are not
held for a later visit. Persist durable state in entities or headers so a new
subscriber can reconstruct it. Do not compensate for previously reversed
per-user scoped-message ordering; messages now arrive in issue order.

## Client state and presentation

Treat received EntityStore values, Frame values and replicated client ECS
components as read-only. Copy them into application-owned prediction or
presentation state before mutation. For arrays or nested mutable values, copy
the values you will mutate as well as the surrounding object. History copy APIs
and interpolation samples provide independent values according to the binary
type's clone behavior.

Process channel closes before replacement opens and channel changes. On socket
disconnect, release presentation and input/prediction resources without waiting
for a final channel-close frame. Stop the old network loop. Use a fresh Client
and new session-bound interpolation/prediction helpers for a replacement
connection. A transport close does not reset the old Client's state or unsent
commands.

Use the maintained [plain client](./plain-channels.md#canonical-small-client) or
[ECS client](./ecs-channels.md#canonical-small-client). `drainFrames()` applies
its returned batch to the store before returning; use `processNextFrame()` when
a feature needs store state at each individual snapshot boundary.

## ECS and object lifetime

- Create a spatial ECS root before its components. New roots/components must
  survive their first snapshot; remove them in a later tick. Validate temporary
  actions before allocating network ids. Existing components can be removed
  after writes or replaced with a new component of the same type in that later tick.
- Bound `mutate` methods assign and emit. Bound `writer` methods only emit;
  assign authoritative state yourself before calling them.
- Use the binding's removal APIs to keep world and channel ownership aligned.
  Removing the selected spatial component hides the root. Remaining bound
  components can still be removed; writes require spatial selection.
- On the client, use the ECS appliers for component replacement. Release
  component-specific presentation when that component is deleted even if its
  root remains alive. Use `beforeRemoveEntity` for root-owned resources.
- Pass actual registered parent/child objects to lifecycle calls. Copies with
  matching nids are rejected. Keep needed ids before removal, since removal
  clears the original objects' nids.

See [ECS lifetime and mutation responsibility](./ecs-channels.md#mutation-responsibility)
and [parent/child entities](./networking-primitives.md#parentchild-entities).

## Prediction, history and pause recovery

Review custom correction thresholds: default command correction can detect
non-position differences, and replay helpers honor `affectedProps`. Keep that
list consistent with the state each operation owns. Do not turn a long browser
pause into a burst of accumulated movement commands; follow the
[movement loop](./realtime-movement-prediction.md#client-loop).

`Historian` has been removed. Migrate to selected spatial facts and scalar/flag
values in `Historian2D` or `Historian3D`; no coordinates are required for values.
Queries now use server milliseconds, not an age relative to the latest tick.
See [the historian migration](./historian-lag-compensation.md#values-without-geometry-and-migration).

`PublicPositionSmoother2D` has been replaced by `PublicPathSmoother2D`. Store one
per public body, enqueue every raw step, step once per server tick, and publish
its x/y. `enqueue()` returns false on a configured backlog limit; game code must
handle it. `reset()` is an explicit teleport. See the
[path recipe](./realtime-movement-prediction.md#public-path-smoothing).

Prediction reconciliation events are now coalesced per entity, with the union of
affected properties and the latest confirmed expectation per property. Update
handlers that assumed separate callbacks for each exact property group.
`StateReplayPrediction` refreshes pending expected results after replay. Its
`expectedValues` callback receives either local or replay state before a step;
custom-shaped state should provide this callback. Original input stays unchanged.

Use `processNextFrame()` when observing a snapshot's authority and input
completion together. Reconcile on each authority update even if completion did
not advance. The updated action-game recipe uses immediate render-duration
commands; a fixed physics loop remains a separate application model.

Timing fixes require no adapter changes: Ping timestamps are written after
snapshot preparation, and estimated view time stays anchored at command receipt.
Actual displayed sample time is preferred over estimated server-now for shots.

## Check an upgraded game

Exercise connection acceptance and denial, movement/prediction, a request that
changes replicated state, channel exit/re-entry, and both abrupt and intentional
disconnects. For ECS games, include component replacement and spatial removal /
reactivation. Check that render resources disappear and stale input does not
reach a replacement connection.

Include a representative load run with your real commands, payload sizes,
mutation rate and channel choice. Array-heavy state needs its own check because
correct retained-value copies add work that scalar properties do not. Review
network-limit and snapshot-send diagnostics during the run. A passing library
suite does not replace the game's own simulation and rendering checks.
