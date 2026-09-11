# Real-time movement prediction

For a simple action game, default to immediate input with a recorded duration.
Each render frame samples input, predicts it immediately, and sends that same
input and duration. The server applies each command in order inside command
processing. A 144 Hz client and a 20 Hz server can agree exactly: a server tick
may integrate seven client steps before publishing one snapshot.

This is the baseline for independent movement, automatic fire and reload. Shared
physics needs a deliberately different simulation/replay model; see below.

## Shared command simulation

```ts
type MoveCommand = {
    ntype: number
    inputX: number
    inputY: number
    dtMs: number
}

function applyMove(state: { x: number, y: number }, command: MoveCommand) {
    const length = Math.max(1, Math.hypot(command.inputX, command.inputY))
    const distance = PLAYER_SPEED * command.dtMs / 1000
    state.x += command.inputX / length * distance
    state.y += command.inputY / length * distance
    resolveStaticWallCollision(state)
}
```

Use the same normalization, duration, collision rules and state on both sides.
Choose wire precision that preserves the input you predicted; Float64 durations
avoid predicting a different value from a Float32-rounded duration. Movement is
applied once per command, using its duration, rather than once using server dt.
The original input remains immutable until confirmation.

The server validates fields and bounds each duration. It also limits the sum of
accepted durations against elapsed server time with a bounded allowance for
network bursts. A per-command maximum alone does not prevent speed hacking.
Rejecting a command is a resolved outcome; do not silently substitute server dt.

```ts
commands.on<MoveCommand>(NType.Move, ({ user, command }) => {
    const player = playersByUser.get(user.id)
    if (!player || !validateInput(command) || !consumeInputTime(player, command.dtMs)) return
    applyMove(player.raw, command)
    resolvePlayerActions(player, command)
    publishRawState(player)
})

// Drain the whole queue and finish all simulation needed by those inputs first.
for (const user of instance.users.values()) {
    user.confirmCommandsThrough(user.lastReceivedCommandFrameNumber)
}
instance.step()
```

`confirmCommandsThrough(K)` means the snapshot reflects the handling of the
entire received prefix through K, including deliberately rejected inputs. It
never means merely received. A deferred simulation retains batch numbers and
confirms only its completed prefix. Games without prediction also confirm
commands to release retained client inputs; request-only services need no command
confirmation. See [the command contract](./networking-primitives.md#command-payloads-and-sequencing).

## Client loop

Keep received authority, predicted simulation, and displayed position separate.
Received `EntityStore`, Frame values and replicated client ECS components are
read-only. Create game-owned prediction state. Never replay from an interpolated
position or feed a smoothed display position back into simulation.

```ts
const prediction = new CommandReplayPrediction({
    client,
    nid: () => controlledNid,
    getLocal: () => predictedPlayer,
    createReplayState: authority => ({ x: authority.x, y: authority.y }),
    applyCommand: applyMove,
    affectedProps: ['x', 'y']
})

function renderFrame(dtMs: number) {
    let frame
    while ((frame = client.network.processNextFrame())) {
        applyNetworkFrame(frame)
        prediction.reconcile()
    }

    if (document.hidden || dtMs > 100) {
        clearHeldInput()
    } else if (dtMs > 0) {
        prediction.predict({ ...readMoveCommand(), dtMs })
    }
    renderLocalPlayer(predictedPlayer)
    renderRemotePlayersFromInterpolation()
    client.flush()
}
```

The 100 ms cutoff is an application pause policy, not a nengi limit. Clear input
on blur/visibility changes and reset the render clock on return. Do not convert a
long pause into movement with the keys currently held. While hidden, a maintenance
timer can apply frames and flush essential traffic without generating movement;
browsers may suspend that timer too. See [timing and liveness](./timing-and-liveness.md).

Process each frame before observing its state and confirmation together.
`drainFrames()` applies all queued snapshots before returning its array; the raw
store then belongs to the last one. Do not pair an older returned frame's
confirmation with that final store. `processNextFrame()` supports observation
and reconciliation even when confirmation did not advance. `onReconcile` reports
resolved prediction operations; it is not an event for every authority change.

`CommandReplayPrediction` rebuilds authority plus every still-pending command,
in original order and with its original duration. If this equals the current
prediction, it leaves local state alone. It does not require a cached expected
position for every input. Supply `createReplayState` and `applyReplayState` for
the fields this helper owns; copy nested mutable values explicitly. The default
copy is shallow. Its default XY correction tolerance is 0.001; differences in
other simulation fields also cause correction. Override error measurement when
a game needs different tolerances.

For optional visual correction smoothing, preserve the pre-correction display
position as an offset from the corrected prediction, then decay that offset.
New input moves the corrected prediction immediately. Large teleports can clear
the offset. Display smoothing never changes pending inputs or expected results.

## Persistent predictions and skipped confirmations

Confirmation is cumulative. The server may confirm 1007 without publishing
1000–1006. An expected switch value from input 1000 must still be compared at
1007 unless a later confirmed expectation supersedes that property. Matching
final state does not prove each intervening action succeeded; use an individual
request result when that distinction matters.

`Predictor.onReconcile` emits one event per affected entity, with the union of
its confirmed affected properties. It compares the latest expected value per
property across the whole resolved prefix, including overlapping groups. An
omitted property list means the whole entity. Handlers must filter the properties
they own; unrelated helpers must not overwrite each other's state.

`StateReplayPrediction` rebuilds pending expected values after every replayed
payload. Explicit expected maps identify the properties to recapture from replay
state. For a different replay/expected shape, provide `expectedValues(state,
payload)`: it computes the expected result from the **pre-step** state, both on
prediction and replay. Return independent values for mutable properties. A
corrected input 1000 must rebuild the expectations for every still-pending input
1001 onward, not only change the position currently being drawn.

One helper should own coupled state and understand all overlapping payloads.
Movement and weapon state can be independent only when neither changes the
other's simulation. Request predictions resolve individually; they are not
retired by command confirmation.

## Public path smoothing

Raw input integration can arrive at the server in bursts. `PublicPathSmoother2D`
is an optional game-owned body that follows the actual raw route for observers.
Store one on a player or in a local ECS component. Enqueue **every** resulting
raw position, including collision waypoints if a command takes a multi-segment
route. Enqueueing only the last position of a server tick loses those turns.

```ts
const publicBody = new PublicPathSmoother2D({
    x: raw.x, y: raw.y,
    speed: PLAYER_SPEED,
    catchupSpeed: PLAYER_SPEED * 1.25,
    maxWaypoints: 128,
    maxDistance: PLAYER_SPEED * 0.5
})

// After computing a proposed command result, before committing it:
if (!publicBody.enqueue(nextRaw.x, nextRaw.y)) {
    rejectThisInput() // This game's explicit backlog policy.
    return
}
commitRaw(nextRaw)

// Once per server tick, with elapsed server milliseconds:
publicBody.step(dtMs)
publishPublic(publicBody.x, publicBody.y)
```

`queuedDistance` is remaining route length. `catchupDistance` defaults to zero;
above it, `catchupSpeed` (default 1.25 × speed) is used. The helper never moves
past the queued endpoint. An identical enqueue needs no slot. A full ring or
exceeded `maxDistance` returns false without changing the existing path. The
point limit defaults to 128; distance is unlimited unless configured. Handle
failure explicitly, rather than silently dropping an old waypoint.

`reset(x, y)` clears the path and teleports the public body. Game code updates
raw authority too and marks the replicated transform with `skipInterpolation`.
No automatic snapping or fairness rule is hidden in the helper. Its bounded ring
reuses points and maintains route length without rescanning the backlog.

Use raw actor position for the actor's own actions. For this model, use the
target's public position for other players hitting that target. Record public
target hitboxes in the historian; the owner reconciles against raw state.
Separate histories can record raw and public facts when both are needed.
Remote adaptive interpolation then smooths snapshot delivery of the public body.
It serves a different role from smoothing bursty command integration on the server.

## Fire, reload, requests, and physics

Automatic fire and reload belong in the same ordered command simulation. Reload
is a one-shot input that interrupts held fire. Replay owns ammo, reserve, cooldown,
reload progress, equipment and any movement modifiers together as needed. Advance
these with the same command duration on both sides. Emit visual effects once on
initial prediction; replay must not create additional bullets or network sends.
Damage remains authoritative. Completing a reload when no commands arrive would
require an additional time policy; don't quietly add a server timer to this model.

A non-predicted pickup can be a request with an individual success/denial result.
If it changes predicted weapon state, explicitly decide where that change enters
the simulation timeline. Commands and requests are ordered within their own
categories; send-call order does not interleave the two categories.

Optimistic requests need separate local state. A late rejection must not restore
an old value over newer authority or another pending action. A successful response
confirms that operation, not that its result is still the latest state. See
[networking primitives](./networking-primitives.md) for request lifecycle details.
A timeout in a healthy immediate game interaction is a request-flow fault worth
investigating, not ordinary gameplay denial. It does not prove rejection or cancel
server work. API-style endpoints doing external work may have normal deadlines.

Shared physics may deliberately read input and integrate it later at fixed
simulation steps. That requires authoritative simulation-step identity, input
assignment and sufficient restored world state. Confirmation alone does not make
server-delta physics equivalent to replaying client-delta commands. Publishing a
partly consumed command while it remains wholly pending can double-count its
consumed portion on replay. Finish the batch before publishing that boundary, or
design application consumption metadata and replay rules. nengi supplies no
universal physics rollback policy. Keep this separate from the simple action
baseline and test it as a distinct model.
