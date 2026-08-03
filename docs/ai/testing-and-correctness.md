# Testing and correctness

Realtime correctness is more than checking that a field eventually has the
right value. Test the transition, the network projection, the client frame, and
the lifecycle boundaries that make the transition observable.

## Test layers

Use several focused layers:

- domain tests for state transitions, validation, movement, collisions, and
  request decisions
- channel tests for visibility, schema writes, spatial membership, and
  lifecycle
- local integration tests for handshake, commands, requests, snapshots, and
  frame application
- maintained bot scenarios for ordinary gameplay actions, connection behavior,
  and client/server protocol coverage
- end-to-end socket tests for adapter behavior, disconnects, and deployment
  configuration
- workload tests for snapshot size, processing cost, and queue pressure

Most behavior should be covered without a real socket. Use
`LocalInstanceAdapter` and `LocalClientAdapter` to exercise the same protocol
path in memory. Reserve real transport tests for transport-specific behavior.

When timing behavior is part of the assertion, use the simulated local
adapters with a shared manual clock. Test asymmetric delay, jitter, periodic
stalls, handshake deadlines, Ping/Pong deadlines, prediction replay, and
interpolation buffering through real encoded payloads. See
[network-condition-simulation.md](./network-condition-simulation.md).

Heartbeat tests should prove both sides of the client policy: a client remains
connected while it processes snapshots without calling application
`client.flush()`, and a runtime that stops processing inbound snapshots is
disconnected after `pongTimeoutMs`. Also assert that a Pong-only send does not
advance command frames or release queued application commands and requests.

## Maintained bots

Keep a bot client in sync with the game during development. It should use the
same shared schemas, commands, requests, messages, and context as the real
client. A maintained bot is useful even when it is not a load generator: it can
connect, drain frames, perform a normal action, observe the authoritative result,
and disconnect in a repeatable smoke scenario.

Use `nengi-ws-client-adapter` with `nengi-buffers` for live Node bots, and keep
their versions exactly aligned with `nengi`. Use the local adapters for fast,
deterministic bot populations that do not need socket pressure. The bot should
read frames as well as send commands; otherwise it cannot expose missing
visibility, incorrect frame application, response failures, or stale lifecycle
state.

Keep bot scenarios deterministic where practical. Record the scenario name,
seed, command cadence, request cadence, duration, and bot count. Test ordinary
movement and actions, scoped channel entry and exit, reconnect behavior, and
expected rejection of invalid actions. See [benchmarking.md](./benchmarking.md)
for workload shapes and churn guidance.

## Deterministic simulation tests

Represent a simulation transition as state, input, and explicit time:

```ts
const before = createWorldState()
const input = { x: 1, y: 0 }

applyMove(before.players.get(playerId)!, input, 1 / 60)

expect(before.players.get(playerId)!.x).toBeCloseTo(expectedX)
```

Use a fixed `dt` and fixed random values when testing authoritative simulation.
Test command order, missing input, repeated input, disconnect cleanup, and
large elapsed time separately. If the client replays a movement transition,
run the same input sequence through the client path and compare the result with
the server transition before adding presentation smoothing.

Test the decision boundary rather than only the final object. A movement test
should also cover clamping, collision rejection, ownership, and the network
mutation that makes the accepted position visible.

## Network projection tests

For each replicated state path, assert both state and wire-visible facts:

- automatic channel changes produce the expected update record
- manual writers are called at every explicit mutation point
- ECS bound mutators assign fields and emit the matching mutation
- append-only writers do not silently assign component state
- spatial movement updates cell membership and visibility
- private and headered channels expose data only to intended subscribers
- messages are present for the intended frame and are not used as durable state

Drain client frames and assert creates, updates, deletes, messages, channel
opens, and channel closes. Do not assert only against a server object; a bug can
leave server memory correct while the snapshot or client frame is wrong.

## ECS binding invariants

When an `EcsWorld` is bound to an ECS channel, test the binding's ownership and
failure rules:

- a bound root exists in both stores after successful creation
- a bound component has the expected `pid`, `nid`, and schema fields
- local-only components remain in the client or server world without entering
  the network projection
- `mutate.patch` assigns fields and emits matching property mutations
- grouped mutators assign all grouped fields and emit one grouped mutation
- append-only writers leave assignment to the caller
- component or root validation failure leaves both stores unchanged
- removing a root removes bound state in the documented order
- channel close invokes `beforeRemoveEntity` before local ECS resources are
  destroyed
- a later channel or root id reuse cannot collide with stale local state

Include a failure-path test for a world or channel operation that throws. The
transactional contract matters most when one side has already changed.

## Commands and requests

Commands are streams, so test their sequencing policy:

- accepted sequence numbers apply once
- duplicate or stale sequence numbers follow the documented policy
- malformed commands are rejected without mutating authoritative state
- commands for another user's entity are rejected
- a disconnected user cannot mutate state through a queued command

Requests are actions with results. Test accepted, rejected, unauthorized,
duplicate, timed-out, and capacity-limited cases. For asynchronous handlers,
test whether the result appears in the current application cycle or re-enters a
later queue stage. Assert that a failed request does not partially apply state.

## Client frame order

The client must drain frames in order because snapshots are deltas. Test a burst
of multiple frames and verify that each frame is applied exactly once. Include
these lifecycle cases:

- entity create followed by update in a later frame
- delete followed by a new entity with a reused network id
- channel close followed by channel open using the same channel id
- ECS root close with local-only components attached
- a close and open that are both present in one snapshot

Use `beforeRemoveEntity` to record or release local render and collider
resources before ECS root removal, then assert no stale resource remains.

## Connection churn and lifecycle

Run repeated connect, authenticate, enter-world, act, and disconnect cycles.
Nengi removes disconnected users from their subscribed channels before
`UserDisconnected` is delivered. The application remains responsible for its
own user-to-entity, room, timer, physics, and persistence state.
After each window, assert the lifecycle counts that should be empty:

- active users and subscriptions
- user-to-player and room-to-user indexes
- authoritative entities owned by disconnected users
- pending commands, requests, timers, and application queues
- client presentation records and local ECS roots

For longer runs, record process memory and heap snapshots after equivalent
windows. A stable request or entity count with growing memory often indicates a
retained callback, timer, subscription, socket listener, or application-owned
map entry. Churn can also expose double cleanup, id reuse, and channel close
ordering bugs that a single connect/disconnect test misses.

## Untrusted input and operations

Test handshake rejection, schema fingerprint mismatch, oversized payloads,
unknown types, invalid numbers, invalid coordinates, invalid channel ids, and
request pressure. Verify that malformed traffic produces a bounded failure and
does not corrupt the next valid snapshot.

For diagnostics, include connection id, user id, command or request id,
sequence number, channel id, and snapshot or frame number where available. Do
not log handshake secrets or full payloads by default.

## Performance tests

Measure the workload the game actually has:

- active users and subscribed entities
- moving entities and mutation rate
- snapshot bytes and update frequency
- request and command pressure
- channel visibility churn
- client frame application and presentation cost

Benchmark after correctness tests establish the mutation contract. An
optimization that reduces CPU while dropping writer calls, frame facts, or
visibility boundaries is a correctness regression.

See [benchmarking.md](./benchmarking.md) for bot workload design and
[operations.md](./operations.md) for production diagnostics.
