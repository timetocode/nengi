# Client state and presentation

The normal client boundary is:

```text
binary snapshot -> ClientNetwork -> EntityStore -> Frame
```

`EntityStore` owns the latest raw authoritative network state. `Frame` reports
what changed while one snapshot was applied. The application owns rendering,
local UI state, prediction state, interpolation choices, sounds, and other
presentation resources.

Each frame also exposes `serverTimeMs`, the server's monotonic timestamp for the
snapshot, and `receivedAtMs`, the local client arrival time. These are different
clock domains. Server time is useful for command timing and lag compensation;
the default interpolators use local playback and arrival history instead of
requiring a synchronized server render clock.

## Basic loop

```ts
const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const interpolator = new AdaptiveInterpolator(client)
await client.connect('ws://localhost:8079')

function frame() {
    for (const frame of client.network.drainFrames()) {
        applyNetworkFrame(frame)
    }

    updatePresentation()
    sendCommandsAtTheirFixedCadence()
    client.flush()
    requestAnimationFrame(frame)
}
```

Always process queued frames in order. Snapshots contain deltas; skipping an
older queued snapshot can leave the store missing state required by a later
snapshot.

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

`updateEntities` contains applied changes. Read the current entity from the
store when the presentation needs the full state. `deletedEntities` carries the
last known entity when available, which is useful for cleanup and effects.

Top-level messages describe connection or user context. Channel messages belong
to a particular visibility scope. Use durable entities or headers for state
that a new subscriber must reconstruct; use messages for transient events.

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

## Prediction

Prediction keeps local state in the application and reconciles it against raw
authority:

```ts
const movement = new CommandReplayPrediction({
    client,
    nid: () => controlledPlayerNid,
    getLocal: () => predictedTransform,
    applyCommand(state, command) {
        applyMoveStep(state, command, command.dt)
    },
    affectedProps: ['x', 'y']
})
```

Use a deliberate command cadence and the same movement units and time model on
client and server. Presentation smoothing belongs after reconciliation, not
inside the replay transition. See [realtime-movement-prediction.md](./realtime-movement-prediction.md).

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
