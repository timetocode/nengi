# Architecture and tick flow

Nengi is a networking boundary, not a game engine. The application owns
authoritative state, simulation, scheduling, presentation, and effects. Nengi
transports selected state and reports the changes that arrived at the client.

The clearest application architecture makes the direction of mutation visible:

```text
input and I/O
    -> decode and queue
    -> validate and decide
    -> apply authoritative state changes
    -> project changes to nengi channels
    -> build a snapshot
    -> send I/O
```

The client has a related flow:

```text
snapshot bytes
    -> ClientNetwork and EntityStore
    -> ordered Frame facts
    -> ECS or presentation state
    -> prediction and interpolation
    -> render and send commands
```

Keep these flows explicit. The application can use classes, ECS systems, or
ordinary functions, but a reader should be able to identify who owns each piece
of state and when it may change.

## Functional core and imperative shell

Use a functional core and an imperative shell as a design target. This does not
require immutable data or a purely functional language.

The core contains decisions and state transitions:

- movement and collision decisions
- permission and validation rules
- spawn and despawn decisions
- request results
- channel membership decisions
- the next authoritative state from current state, input, and `dt`

The shell contains effects and scheduling:

- adapter callbacks and socket writes
- clocks, timers, and random sources
- persistence and external services
- logging and metrics
- renderer, audio, and UI calls
- `instance.step()`, `client.flush()`, and the application loop

A core function may mutate a state object when that is the local convention. The
important property is that its owner, inputs, outputs, and mutation point are
obvious. A useful shape is:

```ts
type MoveInput = { x: number; y: number }

function applyMove(state: PlayerState, input: MoveInput, dt: number): void {
    const direction = normalize(input.x, input.y)
    state.x += direction.x * state.speed * dt
    state.y += direction.y * state.speed * dt
}
```

The caller owns the order, the clock, and the decision to emit the resulting
state. Do not hide those in a constructor, registration callback, or universal
runtime object.

## State ownership

Give each important state category one clear owner:

- authoritative gameplay state belongs to the server simulation
- network projection state belongs to the channel or ECS binding that emits it
- raw client network state belongs to `EntityStore` or the client `EcsWorld`
- presentation state belongs to the client application
- external resources belong to the module that opens, uses, and closes them

An ECS resource is a legitimate resource boundary when it represents one
long-lived dependency or singleton service with a coherent lifecycle, such as a
clock, historian, physics service, renderer, or connection index. It is not a
reason to put unrelated state into one object and pass that object to every
function. A resource should have a narrow job and a visible owner.

For networked ECS state, `bindEcsChannel` is a projection boundary. The
`EcsWorld` remains the gameplay query and mutation surface; the binding keeps
selected roots, components, and channel records aligned. Local-only components
can remain in the world without being added to the binding.

## Server cycle

For a game server, choose one application tick and make its stages visible. A
canonical cycle is:

1. Drain lifecycle and input events from the instance queue.
2. Validate connection state, command shape, ownership, and sequence policy.
3. Process a bounded batch of requests at the documented request boundary.
4. Apply commands in a defined order.
5. Run authoritative simulation systems with an explicit `dt`.
6. Apply channel view and spatial membership changes.
7. Emit manual or ECS mutations that correspond to state changes.
8. Call `instance.step()` to create the snapshot boundary and timestamp it in
   the server's monotonic time domain.
9. Let the adapter flush the resulting bytes.

The exact stage order can differ when the game requires it. The order must be
deliberate and stable. In particular, do not let adapter callbacks, promise
continuations, or arbitrary module registration decide when gameplay state
changes.

`instance.processRequests(limit)` is an application stage, not a replacement
for the game loop. Keep its location and limit visible. A request handler can
validate and mutate authoritative state, return a response, or schedule an
application-owned continuation. If an asynchronous operation completes after
the current cycle, re-enter the simulation through an explicit queue when its
ordering matters.

## Client cycle

The client should expose its order just as clearly:

1. Drain all queued frames in arrival order.
2. Apply network frame facts to presentation or the client ECS world.
3. Update prediction from raw authoritative state and pending commands.
4. Sample interpolation for entities that are not locally predicted.
5. Render and run presentation effects.
6. Send commands at their deliberate cadence.
7. Call `client.flush()`.

Nengi snapshots are deltas. Do not skip an older queued frame to display a newer
one. Apply a frame's state before consuming presentation facts that depend on
that state. Use `beforeRemoveEntity` when an ECS root removal must release
renderers, colliders, or other local resources before the world removes the
root.

## Time and determinism

Make the source and unit of `dt` explicit at every simulation boundary. A common
server model is a fixed simulation step with commands assigned to that step. A
client may render at a variable rate, but its predicted movement step should use
the same movement units and command timing model that the server replays.

Do not use render `dt` as a substitute for a command step. Do not let a timer
inside a system silently become the authoritative clock. Pass time into the
transition that consumes it, and keep presentation interpolation outside the
authoritative transition.

When a transition depends on time or randomness, inject the value or source at
the shell boundary. This makes a server outcome reproducible from state, input,
`dt`, and the chosen random values.

Nengi's network clock is also injectable through `Instance` and `Client` options
for deterministic tests. Keep the application simulation clock explicit even
when Nengi supplies snapshot timestamps. Nengi's default interpolation cursor is
client-local presentation state; it is not an authoritative server-time clock.

## Mutation ledger

For every replicated field, identify the mutation path that makes it visible to
nengi:

- automatic channels observe object state at snapshot time
- manual channels require a writer at each networked mutation point
- ECS channels require component writers or bound mutators
- `bindEcsChannel` mutators assign component state and emit the matching change

Keep this ledger close to the authoritative system that changes the field. A
function that changes `x` should make it apparent whether spatial membership or
a network writer also needs to run. A function that only appends a writer
mutation should be named and used as an append-only operation.

## Effects and feedback boundaries

An effect is an interaction with something outside the function's supplied
state and return values. Network sends, filesystem writes, timers, renderer
calls, logging, and reads from a live clock are effects. Effects are normal; the
problem is when they are hidden inside unrelated decisions or happen through
callbacks whose order is unclear.

Put effects at named boundaries. A simulation function can return a result and
an effect description, or the shell can perform a small known effect directly
after the transition. A feedback loop is acceptable when it crosses an explicit
boundary such as the next input queue, the next network frame, or the next
application cycle.

Avoid modules that register hidden callbacks merely to mutate shared state. A
visible queue, function call, or system stage makes the same feedback easier to
test and audit.

## Further reading

- [Networking primitives](./networking-primitives.md) defines the protocol
  facts that enter and leave these cycles.
- [ECS world](./ecs-world.md) defines ECS resources and the server-side channel
  binding.
- [Real-time movement prediction](./realtime-movement-prediction.md) applies
  the timing rules to predicted movement.
- [Service patterns](./service-patterns.md) applies the same boundaries to
  non-game processes.
- [Testing and correctness](./testing-and-correctness.md) turns the boundaries
  into test cases.
