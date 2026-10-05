# Manual for building with nengi

This is the public manual for game developers and the agents helping them. It
ships with the npm package and is self-contained. Read this entry page, then the
topics relevant to the game you are building.

## Start with a running project

[Getting started](./getting-started.md) copies and runs the maintained
[shared room starter](../../examples/basic-movement/README.md). It includes both
sides of a connection, schemas, commands, interpolation and cleanup. It is a
complete small application, with no prediction or confirmation code.

For an existing project, start with [adapters](./adapters.md) and
[package compatibility](./package-compatibility.md). For an upgrade, read the
[migration guide](./migration.md). Use root imports from `nengi`; unrelated older
projects and deep implementation imports are not API references.

## Choose the game's model first

nengi does not own the game loop, renderer, physics, inventory or ECS scheduler.
Decide what the feature represents and who should see it before choosing an API.

| Need | Starting point |
| --- | --- |
| Everyone in a room sees the same durable state | `Channel` |
| Visibility depends on 2D position or a projected plane | `Channel2D` |
| Visibility depends on true 3D position | `Channel3D` |
| Reliable, explicit mutation points justify manual writes | The corresponding manual channel |
| Network state is organized as roots and components | `EcsChannel` / `EcsChannel2D` / `EcsChannel3D` |
| Auth, selected character or room before acceptance | Connection handshake |
| Repeated player input, or ordered movement/fire/reload | Commands |
| A validated interaction that needs a result | Request/response |
| A transient effect or notification | Message |
| Inventory, container or other separately subscribed state | Headered channel |

Several channels can coexist: a spatial world, a private inventory and a shared
opened chest need different visibility. Spatial channels do not replace gameplay
queries or permission checks. Manual writes trade automatic scanning for explicit
application responsibilities; they are not a universal upgrade.

## Choose movement and prediction deliberately

- A slower interaction game can display everyone through adaptive interpolation,
  including its controlled player. Ordinary commands need no confirmation calls.
- For sharp action movement, apply each input locally immediately and send its
  duration. Apply the same movement in server command processing. Use
  [command replay](./realtime-movement-prediction.md) and explicitly confirm
  completed input before the resulting snapshot. Do not invent a delayed physics
  buffer just to make the server run at a fixed rate.
- Shared physics may integrate inputs at a different boundary. Specify the
  simulation-step and replay contract; receipt is not integration. See
  [architecture and ticks](./architecture-and-ticks.md).
- Requests have their own results. Optimistic request UI does not require the
  command-confirmation mechanism. Keep actions that must interleave with movement
  and firing, such as reload, in that command stream.

## Keep ownership visible

Define TypeScript state beside its [binary schema](./shared-state.md). Treat
received entities, frame values and replicated client ECS components as read-only.
The client owns mutable presentation, local simulation and smoothing state.

`EntityStore` holds current authoritative state. `Frame` reports ordered snapshot
changes: channel lifecycle, entity/component CRUD and messages. Interpolators
sample retained history. Prediction compares raw authority with local simulation;
smoothed rendering must not become the next prediction's input.

For plain objects, derive presentation directly from frame facts and store reads.
For ECS, apply frame CRUD to an `EcsWorld` with a small sync layer. On a server
that owns both an `EcsWorld` and an ECS channel, prefer `bindEcsChannel` for bound
roots so lifecycle and component writes stay paired.

Use readable TypeScript, four-space indentation, no semicolons and one statement
per line. Keep decisions and state transitions in focused functions, with clocks,
I/O, rendering and mutation boundaries visible in the tick/render shell.

## Common traps

- An entity belongs to one channel. Moving it between channels is delete/create,
  not stable-nid transfer. Save the nid returned by `removeEntity`; the removed
  object's nid is reset.
- Spatial moves need membership updates. Manual mutations need writers at every
  networked mutation point. Read the selected channel's contract.
- Do not exclude a controlled player from interpolation until a complete local
  prediction path renders it instead.
- Apply all delta snapshots in order. Reconcile prediction after each applied
  frame with `processNextFrame()` when intermediate authoritative state matters.
- Register disconnect cleanup before connecting. A closed session requires a new
  Client; an initial failed attempt has different retry rules. Use the
  [connection lifetime](./client-state.md#connection-lifetime) guide.
- Use durable entities for state a later subscriber must reconstruct. A message
  alone cannot initialize that subscriber.

## Topic map

Read what the current task needs; the whole manual is not a mandatory preamble.
Topic snippets omit application helpers. The starter is the copy-and-run project.

| Topic | Guide |
| --- | --- |
| API choices and exports | [API surface](./api-surface.md) |
| Channels and visibility | [Selection](./channel-selection.md), [spatial channels](./spatial-channels.md), [recipes](./channel-recipes.md) |
| Schemas and replicated types | [Shared state](./shared-state.md) |
| Commands, messages, handshake and requests | [Networking primitives](./networking-primitives.md) |
| Plain objects and spatial adaptation | [Plain channels](./plain-channels.md), [minimal spatial game](./minimal-spatial-game.md) |
| ECS and manual writes | [ECS channels](./ecs-channels.md), [ECS world](./ecs-world.md), [manual mutations](./manual-mutations.md) |
| Small topic fragments | [Canonical snippets](./canonical-snippets.md) |
| Presentation and connection lifetime | [Client state](./client-state.md) |
| Tick order and mutation boundaries | [Architecture and ticks](./architecture-and-ticks.md) |
| Local prediction and public smoothing | [Real-time movement](./realtime-movement-prediction.md) |
| Hit checking and historical state | [Historian and lag compensation](./historian-lag-compensation.md) |
| Transports and compatibility | [Adapters](./adapters.md), [package compatibility](./package-compatibility.md) |
| Clocks, Ping/Pong and timeouts | [Timing and liveness](./timing-and-liveness.md) |
| Hubs, lobbies and non-game applications | [Service patterns](./service-patterns.md) |
| Correctness and simulated connections | [Testing](./testing-and-correctness.md), [network conditions](./network-condition-simulation.md) |
| Profiling and real client bots | [Benchmarking](./benchmarking.md) |
| Deployment and traffic budgets | [Operations](./operations.md), [network limits](./network-limits.md) |
| Suspicious designs and upgrades | [Anti-patterns](./anti-patterns.md), [migration](./migration.md) |
