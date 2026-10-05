# nengi

nengi is a TypeScript networking library for realtime multiplayer games and
applications. Your server owns the state; clients send commands and requests;
nengi sends compact binary snapshots of the state each client should see.

Use your own renderer, game loop, physics and game rules. nengi supplies object
replication, spatial visibility, optional ECS integration, interpolation,
prediction helpers, requests and connection lifecycle management.

## Start here

The [getting started guide](./docs/ai/getting-started.md) runs a complete shared
room in two browser tabs. Its TypeScript source is included in this package at
[examples/basic-movement](./examples/basic-movement/README.md). It uses a Node
server, click-to-move commands and adaptive interpolation, without prediction.

For an existing browser/Node project using WebSocket transports:

```sh
npm install nengi@2.0.0-rc.128 nengi-websocket-client-adapter@2.0.0-rc.128 nengi-ws-instance-adapter@2.0.0-rc.128
```

This is a release candidate. For an existing game, review the
[migration guide](./docs/ai/migration.md) and update client and server together.
For unpublished development builds, see
[local installation](./docs/ai/getting-started.md#using-a-local-candidate).

Official adapters declare compatible core ranges and can release independently.
See [package compatibility](./docs/ai/package-compatibility.md) and
[transport choices](./docs/ai/adapters.md) for other runtimes.

## The model

- **Entities** are persistent replicated state, described by binary schemas.
- **Channels** decide who sees that state. Choose `Channel` for a shared room or
  `Channel2D` / `Channel3D` for spatial visibility. Manual and ECS variants support
  games with explicit mutation boundaries.
- **Commands** carry player input; **requests** ask for a result; **messages** carry
  transient events.
- **Frames** report received changes. The client owns presentation derived from
  read-only network state. Interpolation and prediction are separate choices.

Import the public API from `nengi`. Deep implementation imports are unsupported:

```ts
import { Channel, Client, Context, Instance, defineEntitySchema } from 'nengi'
```

## Documentation

The [manual for humans and agents](./docs/ai/README.md) is self-contained. Read the
entry guide, then the topics your application needs:

- [Choose channels](./docs/ai/channel-selection.md) and [define shared state](./docs/ai/shared-state.md).
- [Commands, messages and requests](./docs/ai/networking-primitives.md).
- [Client state and lifecycle](./docs/ai/client-state.md).
- [Fast action movement and prediction](./docs/ai/realtime-movement-prediction.md).
- [ECS channels](./docs/ai/ecs-channels.md), [spatial channels](./docs/ai/spatial-channels.md), and [manual mutations](./docs/ai/manual-mutations.md).
- [Public API](./docs/ai/api-surface.md), [operational safeguards](./docs/ai/operations.md), and [network limits](./docs/ai/network-limits.md).

Upgrading a game? Read the [migration guide](./docs/ai/migration.md).
Release history is in [CHANGELOG.md](./CHANGELOG.md).
