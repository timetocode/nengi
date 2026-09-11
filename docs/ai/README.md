# AI guide for building with nengi

This directory is for an AI assistant helping a developer build a game with
nengi. It is not the internal nengi contributor guide. Use these files to choose
the right networking primitive, write code in the intended API shape, and reason
about tradeoffs when a multiplayer feature can be modeled several ways.

Read this file first. Then open only the topic files that match the feature you
are building.

If you are creating a new project, start with the pinned npm installation in
[adapters.md](./adapters.md). When updating an existing game, read the
[upgrade checklist](./migration.md) before adapting its network and client loops.

If you need to see the canonical server/client flow without relying on another
project, use [canonical-snippets.md](./canonical-snippets.md). It contains compact
plain-channel and ECS-channel server snippets, links to their maintained client
handlers, and a predicted movement loop. These snippets are orientation
material, not complete game templates.

## Documentation policy

These docs should teach reusable nengi shapes. Prefer small inline snippets over
references to existing projects. A new game should be buildable from these docs
without inspecting another project.

The source package and these AI docs are the canonical RC guidance. Do not copy
deep imports, adapter shapes, or channel shapes from unrelated code when they
conflict with the root package exports or these documents.

## First principles

Model the game feature first. Nengi's primitives map to different multiplayer
facts:

- who can see state
- whether visibility depends on position
- whether data is durable state, a transient event, input, or a validated action
- whether game code knows exact mutations or wants automatic diffing

Choose the primitive that matches those facts. Performance matters, but a
spatial channel is not only an optimization; it is the natural model for a world
where players and entities are spread across space and most of the world is not
in one player's view.

Use manual mutation channels when the game has explicit mutation points and can
reliably tell nengi what changed. Manual channels are not a universal upgrade;
they trade automatic scanning for userland responsibility.

Pick the channel that matches visibility:

- If everyone subscribed to a channel should see everything in it, use `Channel`.
- If visibility depends on 2D position or a projected 3D plane, use `Channel2D`.
- If visibility depends on true 3D position, use `Channel3D`.
- If the game has explicit mutation points, consider the matching manual channel.
- If the game uses nengi's ECS channel model, use `EcsChannel` or `EcsChannel2D/3D`.

Nengi is a networking framework. It does not own your game objects, game loop, physics, inventory system, ECS scheduler, or renderer.

## Expected AI workflow

When asked to build a game feature, identify the networking shape before writing
the code. Avoid inventing a full engine architecture when a few nengi primitives
and ordinary game code will express the feature clearly.

Prefer primitive patterns that can be remixed:

- auth token, selected character, or requested room at socket open: connection
  handshake
- world object with position and durable state: entity in a world channel
- private count or HUD value: private message or one small private entity
- shared container with item lifecycle: headered `Channel`
- repeated player input: command
- validated interaction: request/response
- one-shot visual/audio event: message

Reach for a larger game-template pattern only after these primitive choices are
clear.

When defining replicated state, keep the TypeScript type and nengi schema beside
each other. Use [shared-state.md](./shared-state.md) for the recommended plain
object, ECS component, message, command, and request file shapes.

## If the game request is vague

When the developer asks for a broad prototype such as "make a multiplayer
survival game" or "make a small MMO," choose a coherent networking model before
coding:

- A small arena or lobby-like game usually has one shared `Channel`.
- A world where players spread out and have local vision usually has a
  `Channel2D` or `Channel3D`.
- A container, inventory, terminal, party panel, or remote map is often a
  separate headered `Channel`.
- Repeated player controls are commands.
- Validated interactions such as opening a chest, moving an item, buying,
  crafting, or joining a scoped view are requests.
- One-frame effects, sounds, hit markers, chat lines, and short notifications
  are messages.

If the game combines several spaces, use several channels. A
survival game might have a spatial world channel, one private inventory channel
per player, and one shared headered channel per opened chest or crafting
station.

## Before choosing an API

For any requested feature, answer these questions:

1. Is the data persistent state, a transient event, a client command, or a request/response interaction?
2. Which users should see it?
3. Does visibility depend on position?
4. Is the world 2D, 3D, or 3D projected onto an `xy`/`xz` plane?
5. Does game code already know exactly which properties changed?
6. Is the game using plain replicated objects, parent/child entities, or nengi ECS roots and components?
7. Are mutations automatic/diffable, or does game code already have a central mutation API?
8. Is this feature likely hot enough to need a game-shaped benchmark?

## Canonical client state shape

Use the raw client state surface as the normal bridge from snapshots to game
client code.

- `ClientNetwork` decodes snapshots and applies them to `EntityStore`.
- `EntityStore` is the latest raw authoritative state.
- `Frame` is the per-snapshot change report: creates, updates, deletes,
  messages, channel opens/closes, and channel-scoped CRUD.
- `ChannelFrame` is the channel-scoped part of a `Frame`: channel entity/component
  CRUD plus channel-scoped messages and interpolated messages.
- Interpolators sample retained history for smooth rendering.
- Prediction helpers reconcile local predicted state against raw store state.
  For fast local movement, use [real-time movement prediction](./realtime-movement-prediction.md).

On the client, use `EntityStore` as the authoritative network-state boundary and
derive sprites, UI records, sounds, and local prediction state from frame facts
and raw store lookups. A small application-specific presentation adapter is
fine when it makes that derivation clearer; it should not hide snapshot order or
become a second authoritative network store.

This client guidance is separate from the optional server-side
`bindEcsChannel` projection. A server that owns an `EcsWorld` may use that
binding to keep authoritative ECS state and channel state aligned.

For plain object channels, this raw path is the normal client model: server
channels emit channel-scoped create/update/delete facts, `EntityStore` holds the
latest authoritative objects, and userland owns presentation.

For nengi ECS channels, apply the frame's ECS CRUD to an `EcsWorld`. Keep that
sync layer tiny: CRUD in, ECS mutation plus facts out.

## Common mistakes to avoid

- Do not put the same entity in multiple channels.
- Do not expect stable-nid transfer between channels; model movement between
  channels as delete plus create.
- Do not read `entity.nid` after a successful `removeEntity`; use the returned
  removed nid.
- Do not use spatial channels for permission-only visibility unless position is
  also part of the visibility rule.
- Do not use requests for high-frequency movement input. Use commands.
- Explicitly call `user.confirmCommandsThrough(K)` after completing command
  simulation and before the snapshot, including in games without prediction.
  Receipt and routing do not confirm input. See the
  [command contract](./networking-primitives.md#command-payloads-and-sequencing).
- Use the same recorded command duration for render-`dt` prediction and server
  command processing. Pick one timing model and apply it consistently.
- Do not use messages for persistent state that new subscribers must reconstruct.
- Do not choose manual channels unless game code can reliably call mutation
  writers everywhere networked state changes.
- When a server owns an `EcsWorld` and an ECS channel together, use
  `bindEcsChannel` for bound roots instead of manually pairing root lifecycle
  and component writers.

## Read next

Use this map instead of reading every file every time.

- If deciding which channel to use, read [channel-selection.md](./channel-selection.md).
- If defining replicated state and schemas, read [shared-state.md](./shared-state.md).
- If deciding which package exports are appropriate, read [api-surface.md](./api-surface.md).
- If deciding between entities, messages, commands, and requests, read [networking-primitives.md](./networking-primitives.md).
- If wiring plain object channels or ECS channels into client game state, read [client-state.md](./client-state.md).
- If deciding how state, commands, requests, and effects should flow through an
  application, read [architecture-and-ticks.md](./architecture-and-ticks.md).
- If using nengi in a service, hub, lobby, or other non-game process, read
  [service-patterns.md](./service-patterns.md).
- If defining correctness tests or validating a new network model, read
  [testing-and-correctness.md](./testing-and-correctness.md).
- If testing seeded latency, jitter, asymmetric links, or periodic stalls, read
  [network-condition-simulation.md](./network-condition-simulation.md).
- If making a fast action game with local movement prediction, read [realtime-movement-prediction.md](./realtime-movement-prediction.md).
- If the game uses ordinary replicated objects instead of ECS components, read [plain-channels.md](./plain-channels.md), which includes a small canonical server/client shape.
- If creating a small 2D spatial prototype, read [minimal-spatial-game.md](./minimal-spatial-game.md).
- If you need compact server/client wiring, read [canonical-snippets.md](./canonical-snippets.md).
- If wiring sockets or local test transports, read [adapters.md](./adapters.md).
- If defining clocks, Ping/Pong, handshake deadlines, or disconnect liveness,
  read [timing-and-liveness.md](./timing-and-liveness.md).
- If adding common game features, read [channel-recipes.md](./channel-recipes.md).
- If adding lag compensation, hit validation, rewind queries, or server-authoritative fairness rules, read [historian-lag-compensation.md](./historian-lag-compensation.md).
- If optimizing explicit updates, read [manual-mutations.md](./manual-mutations.md).
- If visibility depends on position, read [spatial-channels.md](./spatial-channels.md).
- If the game uses ECS-style roots and components, read [ecs-channels.md](./ecs-channels.md), which includes a small canonical server/client ECS shape.
- If the game uses ECS resources, cached queries, or client/server ECS service boundaries, read [ecs-world.md](./ecs-world.md).
- If configuring connection/traffic budgets or diagnosing a limit disconnect, read [network-limits.md](./network-limits.md).
- If hardening a deployment or diagnosing network failures, read [operations.md](./operations.md).
- If deciding whether an optimization helped, read [benchmarking.md](./benchmarking.md).
- If the design feels suspicious or you are auditing for common bugs, read [anti-patterns.md](./anti-patterns.md).
## Common nengi primitives

- Connection handshake: client-provided setup data that `instance.onConnect`
  validates before accepting a socket.
- Entity: persistent replicated state with `nid`, `ntype`, and schema properties.
- Message: transient payload for one-off events.
- Command: client-to-server input that does not inherently expect a response.
- Request/response: client-to-server interaction that expects a result; it is
  not server-to-client RPC.
- Channel: server-side visibility/subscription container.
- Channel header: schema-backed client context for a channel.
- EntityStore: client-side authoritative raw state, indexed by nid and channel.
- Frame: per-snapshot change report returned after nengi applies a snapshot.
- `StaticInterpolator` / `AdaptiveInterpolator`: sample retained entity history for smooth rendering.
- `PublicPathSmoother2D`: optional game-owned path follower for public positions; enqueue every raw step and handle backlog limits explicitly.
- Schema: binary definition of properties nengi can write over the network.

## Default recommendation

Choose the channel from the game's visibility model. If all subscribed users see
the same state, use `Channel`. If visibility is spatial, use
`Channel2D` or `Channel3D`. If game code has reliable explicit
mutation points, use the matching manual path where that responsibility is worth
the control.
