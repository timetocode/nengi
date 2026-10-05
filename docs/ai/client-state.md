# Client state and presentation

The normal client boundary is:

```text
binary snapshot -> ClientNetwork -> EntityStore -> Frame
```

`EntityStore` owns the latest raw authoritative network state. `Frame` reports
what changed while one snapshot was applied. The application owns rendering,
local UI state, prediction state, interpolation choices, sounds, and other
presentation resources.

Treat received network values as read-only. This includes entities obtained
from `EntityStore`, values in `Frame`, and replicated components applied to a
client `EcsWorld`. These surfaces can share nested objects or arrays. Userland
may mutate its own copy; copy the nested fields it will change as well as the
outer object. Local-only ECS components remain application-owned mutable state.

Each frame also exposes `serverTimeMs`, the server's monotonic timestamp for the
snapshot, and `receivedAtMs`, the local client arrival time. These are different
clock domains. Server time is useful for command timing and lag compensation;
the default interpolators use local playback and arrival history instead of
requiring a synchronized server render clock.

## Games that own their history

Entity history is enabled by default for nengi's interpolators. A game that
maintains its own checkpoints or only needs current authoritative state can
disable that recording when constructing its client:

```ts
const client = new Client(context, WebSocketClientAdapter, SERVER_TICK_RATE, undefined, {
    entityHistory: false
})
```

This skips per-entity history copies, timeline/deletion records and their
pruning. The raw store, returned frame facts, requests and prediction helpers
continue to work. `client.network.store.historyEnabled` reports the fixed
construction-time choice; history reads on a disabled store return no records.
`FixedStepInterpolator`, `AdaptiveInterpolator` and `StaticInterpolator` require
entity history and throw when constructed with it disabled.

This option does not change recent-frame retention (`maxFrameHistory`) or the
prediction command log. Received values remain read-only; copy the data your
own history retains from live entity/header objects. Nested received values can
remain shared while read-only; copy them before mutating them. For a physics tick that differs from nengi's
publication tick, see [application tick headers](./channel-recipes.md#application-tick-per-publication).

## Basic loop

`SERVER_TICK_RATE` is the shared server snapshot frequency, not the renderer's
rate; see [shared snapshot rate](./architecture-and-ticks.md#shared-snapshot-rate).

```ts
import { SERVER_TICK_RATE } from '../shared/network-config'
const client = new Client(context, WebSocketClientAdapter, SERVER_TICK_RATE)
const interpolator = new AdaptiveInterpolator(client)
await client.connect('ws://localhost:8079')

function frame() {
    if (client.connectionState !== 'connected') return
    for (const frame of client.network.drainFrames()) {
        applyNetworkFrame(frame)
    }

    updatePresentation()
    sendCommandsAtTheirFixedCadence()
    client.flush()
    requestAnimationFrame(frame)
}
```

This fragment shows frame handling while connected. Use the
[complete starter](./getting-started.md) for the connection UI, disconnect cleanup,
fresh-session creation and background frame draining.

Always process queued frames in order. Snapshots contain deltas; skipping an
older queued snapshot can leave the store missing state required by a later
snapshot.

Within a frame, apply channel closes before opens and entity changes. Close
facts describe the old channel and its entities; the same frame can create
their replacements. See the complete handlers in [plain-channels.md](./plain-channels.md)
and [ecs-channels.md](./ecs-channels.md).

## Raw state and frame facts

Use the raw store for current authoritative state:

```ts
const entity = client.network.store.get(nid)
const players = client.network.store.getByNType(NType.Player)
const channelId = client.network.store.getEntityChannelId(nid)
const header = client.network.store.getChannelHeaderById(channelId)
```

Use frames for ordered lifecycle and change facts:

```ts
for (const frame of client.network.drainFrames()) {
    frame.messages.forEach(handleTopLevelMessage)

    for (const channel of frame.channels) {
        channel.messages.forEach(handleChannelMessage)
        channel.createEntities.forEach(createPresentation)
        channel.updateEntities.forEach(updatePresentation)
        channel.deletedEntities.forEach(deletePresentation)
    }
}
```

`updateEntities` contains applied changes. `drainFrames()` applies the entire
requested batch to the store before returning its frames. A store lookup while
iterating those frames therefore sees the latest state in the batch, which may
include a later update or deletion. Use frame facts for effects tied to a
specific transition; use store lookups for the latest full state.
`deletedEntities` carries the last known entity when available, which is useful
for cleanup and effects.

If a handler needs the store to match each frame as it runs, process one frame
at a time:

```ts
let frame: Frame | null
while ((frame = client.network.processNextFrame()) !== null) {
    applyNetworkFrame(frame)
}
```

Top-level messages describe connection or user context. Channel messages belong
to a particular visibility scope. Use durable entities or headers for state
that a new subscriber must reconstruct; use messages for transient events.

## Connection lifetime

Core owns connection state, handshake orchestration, deadlines and teardown. Read
`client.connectionState`: `idle`, `connecting`, `connected`, or `closed`. A socket
being open does not mean that nengi has accepted the session.

`await client.connect(target, handshake?, { signal }?)` resolves after acceptance
with the server's optional JSON `clientData`, or `undefined` when omitted. This
does not wait for the first snapshot or the player's entity. Use
`connect<Setup>(...)` for a `Setup | undefined` result; without a generic it is
`unknown`. See [connection setup data](./networking-primitives.md#connection-handshake).
Every unsuccessful attempt rejects a `ClientConnectionError`
with a stable `code`, plus optional `detail` and `cause`. The connect Promise is the
only lifecycle outcome for an unsuccessful initial attempt. Once connected,
`client.setDisconnectHandler(info => ...)` receives the session's terminal outcome
once. Register it before connecting. There is no separate WebSocket-error callback.

```ts
import { Client, ClientConnectionError } from 'nengi'

const client = new Client(context, Adapter, 20, adapterConfig, {
    connectTimeoutMs: 10_000,
    serverTimeoutMs: 30_000
})
client.setDisconnectHandler(info => {
    stopSessionLoop()
    releasePresentation()
    showDisconnected(info.code)
})

try {
    await client.connect(target, { token }, { signal: attemptController.signal })
    // A peer can close immediately after acceptance, before this continuation.
    if (client.connectionState === 'connected') startSessionLoop(client)
} catch (error) {
    if (error instanceof ClientConnectionError) showConnectionFailure(error.code)
    else throw error
}
```

Initial outcomes are `CONNECT_TIMEOUT`, `CANCELLED`, `CONNECTION_DENIED`,
`REMOTE_CLOSE`, `TRANSPORT_ERROR`, or `PROTOCOL_ERROR`. Overlapping attempts and
reuse after an accepted session reject with `INVALID_STATE` without disturbing
existing work. An established session can end with `LOCAL_DISCONNECT`,
`REMOTE_CLOSE`, `SERVER_TIMEOUT`, `TRANSPORT_ERROR`, or `PROTOCOL_ERROR`.
`CONNECTION_DENIED` keeps the server's denial data in `detail`; malformed data or
transport errors keep the underlying error/event in `cause`. A remote transport
close supplies its transport details in `detail`.

A failed, denied, cancelled or timed-out initial attempt returns to `idle` after
invalidating its transport and callbacks. Retry the same Client after its Promise
rejects; handlers and helpers can stay attached. An already-aborted signal opens
no socket. Aborting after acceptance does nothing: use `disconnect()` to end an
established session.

Each Client supports one established session. Once it ends, state is `closed`;
create a fresh Client, interpolator and prediction helpers for another session.
Reuse the Context and persistent application state as needed. Retry/backoff,
authentication refresh, and restoring gameplay identity belong to the application.
Nengi never automatically reconnects or replays actions.

`disconnect(detail?)` completes logical teardown synchronously on all transports.
While connecting it cancels the attempt; in `idle` or `closed` it is a no-op.
Before notifying game code, nengi clears unsent commands, queued inbound frames,
request timers and pending prediction bookkeeping. Pending requests reject with
`DISCONNECTED`: their server outcome is unknown. Pending prediction operations
become `Cancelled`, without calling reconciliation as if authority rejected them.
The last applied store, frames and history remain readable for disconnected UI.
Application-owned presentation, input and physics state remain the game's cleanup
responsibility. Handler exceptions are logged after cleanup and do not prevent
other request promises from settling.

Commands, requests and network prediction require `connected`; otherwise they
throw `ClientConnectionError` with `INVALID_STATE` before queuing anything.
`flush()` outside that state does nothing and does not advance command frames.
`reportInterpolationDelay()` returns false without queuing a report, so reading
presentation state before acceptance or after close remains harmless.
An application serialization error before a send still throws and rolls outbound
bookkeeping back; it does not itself end the session.

Physical socket closure can finish later. Local diagnostic `detail` is kept as-is;
only a short standard code is sent as the transport close reason, so circular
objects and long Unicode strings cannot prevent cleanup. Use an application
message for rich data that the other peer must receive before disconnecting.
See [deadlines and suspension](./timing-and-liveness.md#client-deadlines).

## Plain channels

For `Channel`, `Channel2D`, `Channel3D`, and matching manual channels, nengi
applies entity CRUD into `EntityStore`. The presentation layer can maintain a
map from network id to a sprite, view model, or other local record:

```ts
const sprites = new Map<number, Sprite>()

function createPresentation(entity: PlayerEntity) {
    sprites.set(entity.nid, createPlayerSprite(entity))
}

function updatePresentation(update: EntityUpdate) {
    const entity = client.network.store.get(update.nid)
    if (entity) {
        updateSprite(sprites.get(entity.nid), entity)
    }
}

function deletePresentation(deleted: EntityDelete) {
    sprites.get(deleted.nid)?.destroy()
    sprites.delete(deleted.nid)
}
```

Channel identity is part of the meaning. The same entity type in a world,
inventory, replay, or party channel may need different presentation behavior.
Use channel headers to classify scoped data when a name is not sufficient.

## ECS channels

For ECS channels, the natural destination is a client `EcsWorld`. Apply channel
frames in the same ordered client loop and keep presentation systems outside the
network applier:

```ts
const channel = frame.getChannel(worldChannelId)
if (channel) {
    const changes = applyEcsChannelFrame(world, channel, {
        beforeRemoveEntity(pid) {
            releaseRootPresentation(pid)
        }
    })

    changes.createdComponents.forEach(createPresentationForComponent)
    changes.updatedComponents.forEach(updatePresentationForComponent)
}
```

When a channel closes, call `applyEcsChannelClose` with the same cleanup hook.
The hook runs before the root and its local-only components are removed, so
renderers, colliders, and other resources still have the data needed to release
them.

The client ECS world may contain local-only components for presentation,
collision, or prediction. The network applier should update only the replicated
portion and leave those local concerns to client systems.

## Interpolation

Interpolation is a presentation choice, not raw authority:

```ts
const sample = interpolator.sampleEntities(visibleMovingNids, interpDelay)
sample.entities.forEach(entity => {
    moveSprite(entity.nid, entity.x, entity.y)
})
```

Render remote moving entities from interpolated samples when that produces the
desired visual result. Keep predicted local state and reconciliation anchored to
raw store state. Do not feed an interpolated render sample back into replay or
authoritative decisions.

`sample.entities` is a `Map` keyed by entity nid. Its `.forEach` callback receives
each entity value; for a `for...of` loop, iterate `sample.entities.values()`.
Iterating the Map directly yields `[nid, entity]` pairs.

History records resolved entity states when they change and preserves the state
needed at the beginning of the retained frame window. An unchanged entity can
therefore remain sampleable without a new history record every snapshot.
Deletion history remains available until it falls outside the retained window.

Use `sample()` when presentation needs every entity visible at the interpolation
bounds. Use `sampleEntities(nids, interpDelay)` or `getEntities(nids, interpDelay)`
when a presentation query already identifies the relevant subset. Full sampling
still constructs an output object for every sampled entity; stationary scenery
and locally predicted objects often do not need that work every render frame.
History copy methods such as `getAt()` and allocating interpolation samples return
independent schema values for built-in types, including numeric arrays. Methods
whose names end in `Ref` or `Refs` expose retained history and must be treated as
read-only. Custom mutable binary types must supply an independent `clone` and,
if they define `interp`, return an independent interpolation result. Without a
custom `interp`, the binary type uses its clone of the latest value.

### Reusable presentation output

For frequently sampled selections, create one `InterpolationOutput` per
presentation consumer and reuse it with `sampleEntitiesInto`. This API is
available on the fixed, static and adaptive interpolators:

```ts
import { InterpolationOutput } from 'nengi'

// Create once alongside the client's presentation state.
const output = new InterpolationOutput()

// Each render frame: use the game's existing interpolation delay.
interpolator.sampleEntitiesInto(visibleMovingNids, output, interpDelay)
output.entities.forEach(entity => moveSprite(entity.nid, entity.x, entity.y))
client.reportInterpolationDelay(output.desiredBufferMs)
```

`sampleEntitiesInto(nids, output, interpDelay, now?)` returns the same output
object. It contains the usual sample diagnostics and a `ReadonlyMap` of poses
keyed by nid. Nengi manages membership; each pose is mutable presentation data.
The next call into that buffer overwrites its current values and diagnostics.
Separate buffers are independent, even when using the same interpolator.
Independent playback timelines still require separate interpolators.

Compatible outer pose objects and the Map are reused. Mutable vector, array and
custom properties still follow their binary type's independent `clone`/`interp`
contract and may allocate new values. This is a lower-allocation API, not a
zero-allocation guarantee. The regular `sample`, `sampleEntities`, `getEntity`
and `getEntities` APIs continue returning independent results.

Keep these lifetime rules explicit:

- Only selected entities visible at the sampled bounds appear. Unselected or
  unavailable entries are removed; empty selections and unavailable history
  empty the result. An absent sample is not an entity-destruction event. The
  application chooses whether to fall back to authority, hold or hide a visual.
- Surviving Map entries keep their insertion order; reordering the selection
  does not reorder the output. Manage draw order in the renderer.
- Object identity is reusable storage, not an entity-lifetime identifier. Process
  create/delete/channel-close facts independently, including ID reuse between
  render frames. Different schemas get fresh poses. Sampling with another
  Context discards previous storage to avoid carrying incompatible fields.
- Do not retain the output as a historical snapshot or prediction checkpoint.
  Use an allocating sample or explicitly copy the fields needed for later work.
  Keep renderer resources and other game-owned metadata outside sampled poses.
- Call `output.clear()` to release its current poses and frame references. It can
  then be reused. Departed poses are not cached for future selections.
- If an input iterator or custom binary function throws, sampling rethrows and
  clears the buffer. References already held by the application may have been
  partially updated; the operation is not transactional. Recursive sampling or
  clearing of the same buffer during a sample is rejected.

## Prediction

Prediction keeps local state in the application and reconciles it against raw
authority:

```ts
const movement = new CommandReplayPrediction({
    client,
    nid: () => controlledPlayerNid,
    getLocal: () => predictedTransform,
    createReplayState: authority => ({ x: authority.x, y: authority.y }),
    applyCommand(state, command) {
        applyMoveStep(state, command, command.dt)
    },
    affectedProps: ['x', 'y']
})
```

Use a deliberate command cadence and the same movement units and time model on
client and server. Presentation smoothing belongs after reconciliation, not
inside the replay transition. See [realtime-movement-prediction.md](./realtime-movement-prediction.md).

`affectedProps` selects overlapping pending operations; the replay-state and
apply callbacks define which local fields this helper owns. Copy nested mutable
values explicitly in `createReplayState`; the default is a shallow object copy.

## Application ownership

Nengi supplies network state and change facts. The application owns:

- sprites, meshes, UI, audio, and camera state
- client-only ECS components and resources
- local input and prediction state
- interpolation delay and render scheduling
- cleanup of renderer, physics, and other local resources

Keep the bridge from network facts to application state small and
domain-specific. A local adapter is useful when it translates frame facts into
a presentation model; keep snapshot order and the raw authority visible at the
boundary so the architecture remains easy to audit.
