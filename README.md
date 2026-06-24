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
npm install nengi
```

This package exposes a root-only public API:

```ts
import { Channel2D, Client, Context, Instance, defineEntitySchema } from 'nengi'
```

Deep imports are not part of the public package contract.

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

The AI-facing docs are the most complete current guide to building games with
nengi. They are self-contained and do not require reading example projects:

- [AI guide](./docs/ai/README.md)
- [Channel selection](./docs/ai/channel-selection.md)
- [Networking primitives](./docs/ai/networking-primitives.md)
- [Plain channel client/server shape](./docs/ai/plain-channels.md)
- [ECS channel client/server shape](./docs/ai/ecs-channels.md)
- [Real-time movement prediction](./docs/ai/realtime-movement-prediction.md)

## Status

Nengi is moving toward a release-candidate API. The root package exports are the
intended public surface for RC work; examples and internal source paths are not
part of the package contract.
