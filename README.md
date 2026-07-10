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
npm install nengi@2.0.0-rc.125
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
- [Service patterns](./docs/ai/service-patterns.md)
- [Testing and correctness](./docs/ai/testing-and-correctness.md)
- [Benchmarking and bot workloads](./docs/ai/benchmarking.md)
- [Operational safeguards](./docs/ai/operations.md)
- [API surface and import tiers](./docs/ai/api-surface.md)

## Release Candidate Changelog

Changes after `2.0.0-rc.121`:

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
