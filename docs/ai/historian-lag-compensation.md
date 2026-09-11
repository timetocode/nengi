# Historian and lag compensation

This document is for an AI assistant adding gameplay that needs server-side
rewind, hit validation, or fairness rules. Historian behavior is an advanced RC
surface: the source code and exported declarations define the contract, while
the gameplay fairness policy remains userland responsibility.

## What the historian is

`Historian2D` and `Historian3D` record compact authoritative facts over time.
They are not second game simulations and they do not decide what is fair. Game
code decides which objects are worth tracking, which time to query, and what a
historical result means.

Recording copies facts from the selected sources. Treat nearest-query samples as
read-only: they can be retained history objects. A spatial query returns
historical samples containing ids and sampled geometry. After a query, userland
may discover that the current object for a returned `nid` has already been
destroyed. That is normal. The game must decide whether to ignore the hit, apply
damage to a corpse/debris record, credit a trade, spawn an effect, or use some
other policy.

Historical existence, current existence, and combat validity are separate
questions:

- Historical existence: did this fact exist at the queried time?
- Current existence: does userland still have a live object for this id?
- Combat validity: should this late-arriving action count under this game's
  rules?

The historian helps with the first question. Game code owns the second and
third.

Track only the state that a historical gameplay decision needs. For a ray shot,
that might be target hitboxes. For falling hazards, that might be hazard circles.
For a shield or invulnerability window, that might be a small boolean or state
flag in the same historian or a separate one. Do not put every static tree, rock, item,
or decorative entity into history unless the game actually needs to rewind it.

It is reasonable to use more than one historian. Separate historians keep
unrelated policies and query shapes apart:

- ray shots: historical target hitboxes
- bullet-hell hazards: historical hazard positions
- combat state: historical shields, teams, damage modifiers, or statuses

For small histories, brute-force spatial queries are often fine. For larger
histories, `Historian2D` and `Historian3D` can keep a per-frame grid index:

```ts
const history = new Historian2D({
    retentionMs: 1000,
    spatialIndex: { type: 'grid', cellSize: 128 }
})
```

The index accelerates nearest-frame spatial queries without changing query
results. Interpolated queries synthesize samples between retained frames while
preserving the same temporal value and existence rules.

Use `Historian2D` for 2D or projected-plane gameplay. Use `Historian3D` for true
3D gameplay such as space games, voxel games, flight games, or vertical culling
combat. The 3D historian supports sphere, AABB, and ray queries with the same
temporal value/existence model as `Historian2D`.

If game code already has a sampling loop and does not want the historian to hold
live object references, use explicit samples:

```ts
history.recordSpatialSample({
    nid: transform.nid,
    x: transform.x,
    y: transform.y,
    radius: 14,
    flags: teamId
})

history.record(serverTick, serverTimeMs)
```

`trackSpatial(...)` is ergonomic because `record(...)` samples tracked objects
automatically, but it intentionally holds references until `untrackSpatial(...)`
is called.

## Timing model

Prefer command timing when the action is caused by a command. The current client
can periodically report its interpolation delay, and commands can carry a
`viewServerTimeMs` estimate. When present, that value means: "the client was
viewing roughly this point in server time when it authored the command."

Use `getCommandViewTimeMs(...)` on the server to choose the historian query
time. It uses explicit viewed server time when the command has it. Otherwise it
uses the estimated viewed server timestamp anchored at receipt. Queue delay
does not move that estimate forward. With no timing, it uses the supplied
fallback rewind from now.

```ts
const queryTimeMs = getCommandViewTimeMs(timing, {
    nowMs: historyTimeMs(),
    fallbackRewindMs: user.oneWayMs + user.interpolationDelayMs,
    maxRewindMs: 250
})
```

Client timing fields are untrusted claims even after nengi validates their
format and arithmetic. The server chooses `maxRewindMs`; a reported view time
is not evidence that an action happened then.

This helper is deliberately about time only. It does not decide whether the
result should count as a hit, dodge, trade, or blocked action.

Fallback timing can use one-way latency plus interpolation delay, but this is
less direct than explicit viewed server time. Clamp rewind windows for
competitive games. A PvE game may allow a generous rewind; a PvP game may choose
a much smaller maximum such as a few hundred milliseconds.

When using `AdaptiveInterpolator` or `FixedStepInterpolator`, report the actual
sample that was displayed, including endpoint clamping:

```ts
const a = sample.frameA
const b = sample.frameB
const viewServerTimeMs = a && b
    ? a.serverTimeMs + (b.serverTimeMs - a.serverTimeMs) * sample.alpha
    : a?.serverTimeMs ?? b?.serverTimeMs

client.addCommandWithTiming(shot, { viewServerTimeMs })
```

Retain this time alongside the displayed remote scene, then attach it to input
authored against that scene. `client.getEstimatedServerTimeMs()` estimates now;
it is not the viewed time. A desired playback cursor can be ahead of available
history too. Custom render models should provide their own displayed server time.
`Frame.tick` is a local applied-snapshot counter, not an authoritative physics tick.

Ping/Pong timing separates snapshot state time from the Ping's send-boundary
clock sample. RTT subtracts client turnaround; estimated one-way delay is half
RTT, not a measurement of directional latency. Asymmetric links and runtime
scheduling still create uncertainty. A viewed timestamp reduces reliance on that
estimate but remains a client claim subject to server policy.

## Values without geometry and migration

The legacy `Historian` export has been removed. Replace whole-schema recording
with deliberately selected facts in `Historian2D` or `Historian3D`. Use the game's
monotonic server milliseconds for records and queries; old APIs took an age
relative to the latest record. Call `record(tick, timeMs)` at the snapshot state
boundary, after updating the facts that will be published.

Boolean, number and string history needs no coordinates or spatial key:

```ts
const history = new Historian2D({ retentionMs: 1000 })
history.setValue(playerId, 'team', 'blue', nowMs)
history.setFlag(playerId, 'shield', true, nowMs)
history.record(serverTick, nowMs) // Also advances retention for values-only use.
const teamThen = history.getValue(playerId, 'team', shotTimeMs)
const shieldThen = history.wasFlagActive(playerId, 'shield', shotTimeMs)
```

Set values when they change. Closed intervals are pruned by `record`; unchanged
open values remain current. `getValue` returns undefined for missing history;
`wasFlagActive` returns false. Geometry is selected with `trackSpatial`,
`trackSpatialTarget` or `recordSpatialSample`. Track the public hitbox for targets
that observers see smoothed, and use the shooter's raw command-applied origin.
Separate historians can retain raw and public geometry for the same id.

Start with `getSpatialNearest` / `queryRayNearest`. Interpolation is optional;
measure its benefit and cost in the game before adopting it. Nearest queries can
clamp to the oldest/newest retained frame, so enforce rewind policy and retention
coverage explicitly. There is no generic whole-entity replacement API.

## Pattern: ray shots

For hitscan weapons, apply the shooter's command first, then rewind targets. Do
not rewind the shooter after applying its command, because that double-counts
latency and makes the judged ray differ from the client-predicted shot.

A typical arena shooter can follow this shape:

1. Process the player's movement command.
2. Run weapon simulation and ammo prediction logic.
3. Build a ray from the player's current raw position to the command aim point.
4. Query historical target hitboxes at the command's view time.
5. Apply damage if the historical target sample intersects the ray.
6. Send a shot message that includes a debug ghost of the historical hitbox.

If a future broadphase accelerates ray queries, it must cover the whole ray
segment from source to target. Sampling only the cells around the shooter or
only the cells around the cursor will miss valid mid-segment hits.

The core timing and query shape can stay small:

```ts
const queryTimeMs = getCommandViewTimeMs(timing, {
    nowMs,
    fallbackRewindMs: user.oneWayMs + user.interpolationDelayMs,
    maxRewindMs
})

const hit = history.queryRayNearest(
    queryTimeMs,
    shooter.rawX,
    shooter.rawY,
    command.aimX,
    command.aimY
).find(candidate => candidate.sample.nid !== shooter.nid)

if (hit) {
    applyDamage(hit.sample.nid)
}
```

Nearest-frame queries are the baseline. Consider interpolated queries only when
measured gameplay cases justify their extra work.

## Pattern: player-dodged hazards

For bullets, falling hazards, or bullet-hell patterns, decide who owns the
collision moment. If the player's local movement is what should feel correct,
process hazard collision from the player movement path:

1. Apply one player command.
2. Query historical hazard positions at the command's view time.
3. Test the command-applied player position against those historical hazards.

This avoids the bad feel where a player sees themselves dodge, then takes damage
because the server later checked a stale raw position against current hazards.

This is a policy choice. If commands stop arriving, input-driven collision may
stop advancing that player's hazard checks. That can be correct for a
player-authored dodge game, but it is not correct for every game. Gravity, lava,
forced movement, and disconnected-player simulation may need server-owned
collision or a separate visual smoothing policy.

## Pattern: fairness decisions

The historian should expose enough information for game code to make its own
fairness rule. Do not assume there is only one netcode policy.

Patterns:

- Standard shooter rewind: honor what the shooter saw within a capped rewind
  window.
- Trade-friendly PvP: allow both players' historical shots to count in a short
  contested window, reducing peeker's advantage.
- Defensive ability priority: a player who activated invulnerability at a
  precise time may be protected even if another player's historical shot saw the
  pre-shield state.
- PvE forgiveness: allow more rewind and more generous hitboxes because nobody
  is harmed competitively.

These are game design choices. The historian's job is to make the relevant past
state available.

## Pattern: death, trades, and delayed cleanup

Do not use the historian to keep entities alive. If an object needs to remain
combat-valid, interactable, visible as a corpse, revivable, or eligible for
trade-kill rules after reaching zero hit points, model that as game state and
delete it later.

```ts
target.hp = 0
target.state = 'dead'
target.deathStartedAt = now
history.setValue(target.nid, 'lifeState', 'dead', now)

// Later, when the game's lifecycle says this object is truly gone:
if (now - target.deathStartedAt > 1000) {
    world.removeEntity(target)
    history.untrackSpatial(target.nid, now)
}
```

A late historical query may hit `target.nid` while `target.state === 'dead'`.
That is not a historian error. The combat system decides whether to ignore the
hit, award assist/trade credit, damage a corpse object, or apply some other
game-specific rule.

For games that do not care about trades or post-death interactions, the rule can
be simple:

```ts
const hit = history.queryRayNearest(...)
const target = hit ? entitiesByNid.get(hit.sample.nid) : undefined
if (!target || target.state !== 'alive') {
    return
}
applyDamage(target)
```

## What not to do

Do not use a single global historian just because it is convenient if the world
has many entities and only a few are relevant to compensation.

Do not sample static world geometry every tick merely because it can be hit. A
tree, wall, or terrain block that does not move usually belongs in a static
gameplay query structure. Use historian existence or value intervals only for
the historical facts that actually change, such as when the object was destroyed
or when a shield/status became active.

Do not mix raw positions, smoothed public positions, and rendered interpolation
without naming which one is being queried. A player may shoot from their raw
server position while other clients see their smoothed public position.

Do not assume a message, shot effect, or muzzle flash is entity-state prediction.
Only durable state that must reconcile against the server belongs in the
prediction and historian conversation.

Do not hide policy in the engine. Lag compensation should be reusable machinery,
but the game should still be able to choose who gets the benefit of uncertainty.

Do not delay channel deletion inside nengi merely because an entity has
historical samples. If deletion should be delayed, delay it in the game's own
entity lifecycle and replicate that lifecycle state normally.

## Inline pattern

For player-authored hazard dodges, keep the timing policy explicit and query
only the historical facts the collision needs:

```ts
const queryTimeMs = getCommandViewTimeMs(latestMoveTiming, {
    nowMs,
    fallbackRewindMs: user.oneWayMs + user.interpolationDelayMs,
    maxRewindMs
})

const hazardSample = history.getSpatialInterpolated(hazard.nid, queryTimeMs)
const hazardX = hazardSample?.x ?? hazard.x
const hazardY = hazardSample?.y ?? hazard.y
const hazardRadius = hazardSample?.radius ?? hazard.radius

if (circleOverlaps(player.rawX, player.rawY, player.radius, hazardX, hazardY, hazardRadius)) {
    damagePlayer(player)
}
```
