# Real-Time Movement Prediction

Use this guidance for fast action games where the local player should move
immediately on input and later reconcile against server authority. Slower games,
turn-based games, menu-heavy games, and games that can tolerate input latency do
not need this whole pattern.

## Core Shape

Pick one movement step model and use it on both sides.

For a fixed command-rate game:

```ts
export const COMMAND_RATE = 30
export const COMMAND_DT = 1 / COMMAND_RATE
export const PLAYER_SPEED = 245
```

The command payload should contain gameplay input, not a custom sequence number:

```ts
type MoveCommand = {
    ntype: NType.MoveCommand
    inputX: number
    inputY: number
    aimX: number
    aimY: number
}
```

Nengi records command-frame sequencing separately. Use
`commandFrameNumber`, `commandIndex`, `frame.confirmedCommandFrameNumber`, or
`CommandReplayPrediction` when prediction needs to know which commands are
confirmed.

## Server Command Path

Process player-authored movement in the command handler, one command at a time:

```ts
commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const player = playersByUser.get(user.id)
    if (!player) {
        return
    }

    applyMoveStep(player, command)
    resolvePlayerMovedCollisions(player, command)
    writePlayerTransform(player)
    world.moveEntity(player)
    world.updateView(user, viewFor(player))
})
```

This is the natural place for collision that is caused by the player's movement:
walls, melee contact, dodge checks, pickup overlap, trigger volumes, and similar
rules. The server should answer "what happened when this command moved the
player?" at the same point where it moves the player.

Do not move the predicted player from client commands and then check those same
player-movement collisions later as a loose server-tick afterthought. That makes
the judged collision moment drift away from the input that created the position,
and it is a common cause of "I dodged that" or "I hit an invisible thing" bugs.

Server-owned simulation still belongs in server systems. NPC AI, lava, gravity,
knockback, scripted platforms, disconnected-player simulation, and other
non-player-authored movement may run during the server tick. The important
distinction is ownership of the movement moment.

## Server Public Position Smoothing

Predicted movement often makes the server process player movement at the
client command rate, not once per server tick. If several movement commands
arrive together, the authoritative raw position may advance in a burst. That is
correct for authority, collision, and reconciliation, but it can look jumpy to
other players if that raw position is replicated directly.

For observer-facing movement, keep two server positions:

- raw position: authoritative gameplay position used for collision, command
  processing, prediction reconciliation, and historian samples
- public position: replicated presentation position that follows raw position
  smoothly for other clients

`PublicPositionSmoother2D` is the small server-side helper for this shape:

```ts
import { PublicPositionSmoother2D } from 'nengi'

type Player = {
    nid: number
    ntype: NType.Player
    rawX: number
    rawY: number
    x: number
    y: number
}

const publicPosition = new PublicPositionSmoother2D<Player>({
    getRaw: player => ({ x: player.rawX, y: player.rawY }),
    getPublic: player => ({ x: player.x, y: player.y }),
    setPublic: (player, x, y) => {
        player.x = x
        player.y = y
    },
    followSpeed: PLAYER_SPEED * 1.5,
    snapDistance: 240,
    settleDistance: 4
})

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const player = playersByUser.get(user.id)
    if (!player) {
        return
    }

    const raw = { x: player.rawX, y: player.rawY }
    applyMoveStep(raw, command)
    player.rawX = raw.x
    player.rawY = raw.y
    resolvePlayerMovedCollisions(player, command)
})

function stepServer(dtMs: number) {
    players.forEach(player => {
        const result = publicPosition.step(player, dtMs)
        if (result.moved) {
            playerWriter.groups.position(player, player.x, player.y)
            world.moveEntity(player)
        }
    })
}
```

Use this when the raw server position moves in command-sized bursts but
observers should see a steadier replicated position. Do not use the public
position for authoritative collision, prediction replay, or rewind queries
unless that is explicitly the game's fairness rule.

## Shared Movement Step

Keep the movement step boring and duplicated if that is clearest. The client and
server should apply the same inputs, normalization, speed, clamp, and collision
policy for the part being predicted.

```ts
function applyMoveStep(state: { x: number, y: number }, command: MoveCommand) {
    let { inputX, inputY } = command
    const length = Math.hypot(inputX, inputY)
    if (length > 1) {
        inputX /= length
        inputY /= length
    }
    state.x += inputX * PLAYER_SPEED * COMMAND_DT
    state.y += inputY * PLAYER_SPEED * COMMAND_DT
}
```

Do not let browser render rate change the amount of simulation. If the server
applies one fixed movement step per command, the client should send commands at
a fixed cadence. If the game wants variable-duration commands instead, include a
bounded duration in the command and apply that same duration on both sides.

## Client Loop

The client has three different movement ideas. Keep them separate:

- raw authority: latest server state in `client.network.store`
- predicted local state: immediate local result of unconfirmed commands
- presentation: what the player sees this render frame

A typical render loop:

```ts
for (const frame of client.network.drainFrames()) {
    applyFrame(frame)
}

movementPrediction.reconcile()

commandAccumulator += dt
while (commandAccumulator >= COMMAND_DT) {
    commandAccumulator -= COMMAND_DT
    movementPrediction.predict(readMoveCommand())
}

renderLocalPlayer(projectPredictedForPresentation(commandAccumulator / COMMAND_DT))
renderRemotePlayersFromInterpolation()
client.flush()
```

`CommandReplayPrediction` sends the command, applies the local command step, and
later rebuilds local predicted state from raw authority plus pending commands.
It should reconcile against raw authoritative state, not against interpolated
presentation samples.

If the command rate is lower than the render rate, drawing only the stepped
predicted position can look bumpy even when prediction is correct. Use a small
presentation-only projection between command steps if the local player needs to
look smooth. Do not feed that projection back into authoritative state or the
prediction replay state.

## What To Avoid

Do not mix these models accidentally:

- client predicts with render `dt`, server moves once per command
- client sends one fixed-step command per `requestAnimationFrame`
- server moves from the last input once per server tick while the client
  predicts every command
- client reconciles predicted movement against interpolated samples
- collision caused by player movement is checked only after unrelated NPC/tick
  systems have moved the world

Any of these can produce drift, correction snaps, or damage that appears to come
from the wrong place.

## Damage And Movement Feel

Damage should have an authoritative source that the client can explain: source
nid/pid, source type, damage kind, and source/player positions are often enough
for a useful debug or hit marker message.

If damage intentionally affects movement, model that explicitly as gameplay
state such as stun, slow, root, knockback, or hitstop. Do not rely on an
incidental prediction correction or visual hitch to communicate the effect.

During development, add cheap diagnostics:

- current prediction error
- correction count and last correction size
- damage source kind
- whether the damage source exists in the client's local state

These diagnostics distinguish a real invisible-source bug from a valid ranged
attack with weak presentation.

## Browser Cache During Local Iteration

After changing shared exports, local package builds, or Vite-served module
paths, a stale browser module can look like a networking bug. If the console
reports a missing or renamed nengi/ECS function after a refactor, rebuild local
packages if needed and hard-refresh the page before judging movement behavior.
