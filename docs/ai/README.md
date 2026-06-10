# AI guide for building games with nengi

This directory is for an AI assistant helping a developer build a game with nengi. It is not the internal nengi contributor guide. Use these files to choose the right networking primitive, write code in the intended API shape, and know when to optimize.

## First principles

Start with the simplest correct networking design. Prefer automatic channels until the feature or benchmark shows a reason to optimize.

Use manual mutation channels when the game already knows exactly what changed, or when profiling shows snapshot construction is expensive. Do not choose manual channels only because they sound faster; they are a deliberate tradeoff that shifts responsibility to game code.

Pick the channel that matches visibility:

- If everyone subscribed to a channel should see everything in it, start with `Channel`.
- If visibility depends on 2D position or a projected 3D plane, use `SpatialChannel2D`.
- If visibility depends on true 3D position, use `SpatialChannel3D`.
- If the game has explicit mutation points and needs more performance, consider the matching manual channel.
- If the game uses nengi's ECS channel model, use `EcsChannel` or `EcsSpatialChannel2D/3D`.

Nengi is a networking framework. It does not own your game objects, game loop, physics, inventory system, ECS scheduler, or renderer.

## Expected AI workflow

When asked to build a game feature, do not start by inventing a full engine
architecture. First choose the smallest networking primitive that represents the
feature correctly, then write ordinary game code around it.

Prefer primitive patterns that can be remixed:

- world object with position and durable state: entity in a world channel
- private count or HUD value: private message or one small private entity
- shared container with item lifecycle: headered `Channel`
- repeated player input: command
- validated interaction: request/response
- one-shot visual/audio event: message

Only reach for a larger game-template pattern after these primitive choices are
clear.

## Before choosing an API

For any requested feature, answer these questions:

1. Is the data persistent state, a transient event, a client command, or a request/response interaction?
2. Which users should see it?
3. Does visibility depend on position?
4. Is the world 2D, 3D, or 3D projected onto an `xy`/`xz` plane?
5. Does game code already know exactly which properties changed?
6. Is the game using plain replicated objects, parent/child entities, or nengi ECS roots and components?
7. Is this feature already known to be hot, or should it be benchmarked after the simple version works?

## Read next

Use this map instead of reading every file every time.

- If deciding which channel to use, read [channel-selection.md](./channel-selection.md).
- If deciding between entities, messages, commands, and requests, read [networking-primitives.md](./networking-primitives.md).
- If wiring client state into a renderer, read [client-router.md](./client-router.md).
- If creating a small 2D spatial prototype, read [minimal-spatial-game.md](./minimal-spatial-game.md).
- If wiring sockets or local test transports, read [adapters.md](./adapters.md).
- If adding common game features, read [channel-recipes.md](./channel-recipes.md).
- If optimizing explicit updates, read [manual-mutations.md](./manual-mutations.md).
- If visibility depends on position, read [spatial-channels.md](./spatial-channels.md).
- If the game uses ECS-style roots and components, read [ecs-channels.md](./ecs-channels.md).
- If deciding whether an optimization helped, read [benchmarking.md](./benchmarking.md).
- If the design feels suspicious or you are auditing for common bugs, read [anti-patterns.md](./anti-patterns.md).

## Common nengi primitives

- Entity: persistent replicated state with `nid`, `ntype`, and schema properties.
- Message: transient payload for one-off events.
- Command: client-to-server input that does not inherently expect a response.
- Request/response: client-to-server interaction that expects a result.
- Channel: server-side visibility/subscription container.
- Channel header: schema-backed client context for a channel.
- ReplicaRouter: client-side router for replicated state, channel-scoped CRUD, messages, and interpolation-aware handling.
- Schema: binary definition of properties nengi can write over the network.

## Default recommendation

Implement the feature clearly first. If all players in a match need the same state, use `Channel`. If the world is large and players only need nearby state, use `SpatialChannel2D` or `SpatialChannel3D`. Add manual mutations later when you can point to a hot update path and say exactly where game code knows the mutation occurred.
