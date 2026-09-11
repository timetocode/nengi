# Updating an existing game

This guide covers upgrading from RC-126 or earlier to **2.0.0-rc.127**. The
main required change is explicit command confirmation on the server, including
games without prediction. Also review the enabled network limits and, if used,
the retired historian/smoother APIs and prediction callback changes below.

Keep nengi, its binary backends and official adapters on the same exact RC
version. Update the server and client together, rebuild browser bundles, and
redeploy any cached assets. The [package README](../../README.md) records the
release history; this page collects the application changes to review.

## Server input and connection lifecycle

| Existing pattern | Required review |
| --- | --- |
| Large client packets or synthetic input bursts | Configure finite `InstanceOptions.limits` for the workload. The default client-to-server packet cap is 64 KiB; it does not cap outgoing snapshots. |
| Custom WebSocket receive limits | Native and core limits both apply. Raising one does not raise the other. |
| Reading forwarded IP headers through ws | Configure `trustProxy` for known direct proxy peers. Otherwise `remoteAddress` is the direct peer address. |
| Direct edits to `instance.queue.arr` | Consume events through `next`, `dequeue`, `removeWhere` or `clear` so retained-input accounting is released. |
| Hand-written command loops | Check `user.connectionState === UserConnectionState.Open` before each command, including commands queued before disconnect. `CommandRouter` handles this check. |
| Any game or service sending commands, including without prediction | Call `user.confirmCommandsThrough(K)` after authoritative handling and before `instance.step()`. Automatic confirmation has been removed. Without the call, the client retains command history. |
| Commands deferred across snapshots | Retain each batch number and confirm only the completed prefix after integration. Never use the latest received number to skip unfinished input. Requests retain their separate completion mechanism. |
| Requests or commands flushed during connection setup | Wait for `client.connect()` to resolve with `accepted: true`. Gameplay packets before acceptance close the connection. |
| Async request handlers | Recheck the user's connection before session-dependent effects after an await. Application work and cancellation remain game-owned. |

See [network limits](./network-limits.md),
[request and disconnect handling](./networking-primitives.md#disconnect-during-an-asynchronous-request),
and [operations](./operations.md) for defaults, diagnostics and transport details.

Server `user.disconnect()` performs logical cleanup immediately. Do not depend
on subscriptions or unstarted requests surviving until the native socket finishes
closing. Earlier command events can remain in the event queue, so drain them
normally and apply the connection check above. Local and simulated-local client
disconnect callbacks can run synchronously inside a disconnect call.

For a synchronous loop that fully drains commands and finishes their simulation
without yielding, add this immediately before `instance.step()`:

```ts
for (const user of instance.users.values()) {
    user.confirmCommandsThrough(user.lastReceivedCommandFrameNumber)
}
```

This also covers empty flushes after completed input. Deferred simulations must
pass the last fully completed batch number instead. Confirmation is cumulative;
it includes deliberate rejections and does not imply every action succeeded.
Request-only applications continue to receive responses and state without it.

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
connection: opening a transport on the old Client does not reset its state or
unsent commands.

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
