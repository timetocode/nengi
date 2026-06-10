# nengi

Nengi is a TypeScript networking framework for realtime multiplayer games. The
server owns authoritative state, clients send commands and requests, and nengi
replicates the relevant state to each client through snapshots.

This branch is active research and development for the next nengi API. Names and
patterns can still change before a release candidate.

## AI-assisted game development

The current documentation priority is helping AI agents build small game
templates and then extend them into real games with a human developer. If you are
an AI assistant, start here:

- [AI guide for building games with nengi](./docs/ai/README.md)

That guide links to focused notes on:

- choosing channels
- choosing entities, messages, commands, and requests
- using `ReplicaRouter` on the client
- building a minimal spatial game
- wiring adapters/transports
- spatial channels for 2D and 3D worlds
- manual mutation channels
- ECS channels
- benchmarking game-specific workloads
- common anti-patterns

Do not use old examples or old README snippets as authority if they conflict
with `docs/ai`.

## Current mental model

- Use an entity for persistent replicated state.
- Use a message for transient events.
- Use a command for continuous or repeated client input.
- Use request/response for client actions that need an accepted/rejected result.
- Use a channel to describe who can see a set of entities or messages.
- Use a channel header when the client needs context for channel-scoped CRUD,
  such as an inventory, team channel, container, or remote map.
- Start with automatic channels. Move to manual mutations only after the game
  has a clear mutation point or benchmark evidence.

Common starting choices:

- Small arena or shared match state: `Channel`
- Large 2D world: `SpatialChannel2D`
- True 3D world: `SpatialChannel3D`
- Hot explicit updates: `ManualChannel` or `ManualSpatialChannel2D/3D`
- Nengi ECS roots/components: `EcsChannel` or `EcsSpatialChannel2D/3D`

## Renderer and game engine

Nengi is renderer-agnostic. It can be used with canvas, Pixi, Three.js,
Babylon.js, custom WebGL/WebGPU renderers, or non-game realtime apps. It does not
own your game loop, physics, ECS scheduler, inventory system, renderer, or UI.

## Examples

Examples in this repository are R&D templates and experiments. They are useful
for seeing patterns in context, but the current API guidance lives in
[`docs/ai`](./docs/ai/README.md).

Useful current examples:

- `examples/player-arena`: prediction, interpolation, channel headers,
  inventory channels, requests, world items, and experimental gameplay features.
- `examples/survival-lol`: a larger 2D spatial-channel template using Pixi,
  server-authoritative survival mechanics, private inventory messages, commands,
  and gameplay spatial queries.

## Status

The API is not stable yet. Prefer small templates, focused benchmarks, and
documented patterns over assuming the current shape is final.
