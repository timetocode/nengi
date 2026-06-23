# Minimal Spatial Game

This is the current shape for a small 2D browser game with a server-authoritative
world, `Channel2D`, client commands, and interpolated remote entities.

For package setup, TypeScript, Vite, and local workspace imports, use
[local-prototype.md](./local-prototype.md). This file only describes the nengi
gameplay shape.

## Server

Create one spatial world channel:

```ts
const instance = new Instance(context)
const world = new Channel2D(instance.localState, 100, { name: 'world' })
```

On connect, create a player, add it to the world, and subscribe the user with a
view:

```ts
function createView(player: PlayerEntity) {
    return { x: player.x, y: player.y, halfWidth: 800, halfHeight: 600 }
}

function spawnPlayer(user: User) {
    const player = createPlayer(100, 100)
    world.addEntity(player)
    world.subscribe(user, createView(player))
    playersByUser.set(user.id, player)
}
```

Handle movement commands with a command router:

```ts
const commands = new CommandRouter()
const speedPerCommand = 10

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const player = playersByUser.get(user.id)
    if (!player) {
        return
    }

    player.x += command.inputX * speedPerCommand
    player.y += command.inputY * speedPerCommand

    world.updateEntity(player)
    world.updateView(user, createView(player))
})
```

Process network events and step the instance:

```ts
while (!instance.queue.isEmpty()) {
    const event = instance.queue.next()

    if (event.type === NetworkEvent.UserConnected) {
        spawnPlayer(event.user)
    }

    if (event.type === NetworkEvent.UserDisconnected) {
        despawnPlayer(event.user)
    }

    commands.process(event)
}

instance.step()
```

For automatic spatial channels, call `updateEntity(entity)` after a spatial
entity moves. Call `updateView(user, view)` when the user's interest area moves.

## Client

Create a client, interpolator, and local presentation records:

```ts
const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const interpolator = new AdaptiveInterpolator(client)
const sprites = new Map<number, Sprite>()
await client.connect('ws://localhost:8079', handshake)
```

Create and destroy local presentation from frame facts:

```ts
function applyFrame(frame: Frame) {
    frame.channels.forEach(channel => {
        channel.createEntities.forEach(entity => {
            if (entity.ntype === NType.Player) {
                sprites.set(entity.nid, createPlayerSprite(entity as PlayerEntity))
            }
        })

        channel.deletedEntities.forEach(deleted => {
            sprites.get(deleted.nid)?.destroy()
            sprites.delete(deleted.nid)
        })
    })
}
```

If the server tells the client which player it controls, keep that nid out of
interpolated rendering and drive it with local prediction:

```ts
let controlledNid: number | null = null
```

Each render frame. This loop sends commands at a fixed 30 Hz command rate
even if the renderer runs faster or slower:

```ts
const COMMAND_INTERVAL_MS = 1000 / 30
let commandAccumulatorMs = 0

function frame(dtMs: number) {
    for (const frame of client.network.drainFrames()) {
        applyFrame(frame)
        frame.messages.forEach(message => {
            if (message.ntype === NType.YouArePlayer) {
                controlledNid = message.nid
            }
        })
    }

    const interpolatedNids = Array.from(sprites.keys()).filter(nid => nid !== controlledNid)
    const sample = interpolator.sampleEntities(interpolatedNids, 100)
    sample.entities.forEach(entity => {
        const sprite = sprites.get(entity.nid)
        if (sprite) {
            sprite.x = entity.x
            sprite.y = entity.y
        }
    })

    commandAccumulatorMs += dtMs
    while (commandAccumulatorMs >= COMMAND_INTERVAL_MS) {
        commandAccumulatorMs -= COMMAND_INTERVAL_MS
        client.addCommand({
            ntype: NType.MoveCommand,
            inputX,
            inputY
        })
    }
    client.flush()
}
```

`maxFrames` chunks catch-up work but does not skip frames. If pending frames
grow too high, reconnect rather than skipping delta snapshots.

Keep command cadence explicit. A fixed server step per command is fine if the
client sends commands at a fixed command rate. If the client sends commands from
`requestAnimationFrame`, a 144 Hz client can otherwise move more often than a
30 Hz client.

The movement command payload only needs the gameplay input. Nengi already
associates sent commands with the current numeric `commandFrameNumber`, exposes
that number to server command handlers, and confirms processed command frames
back on `frame.confirmedCommandFrameNumber`. See
[networking-primitives.md](./networking-primitives.md#command-payloads-and-sequencing)
for the prediction and sequencing shape.

## Gameplay queries

`Channel2D` is network visibility. It is not a gameplay query engine. The
server still needs game-specific logic for gathering range, attack arcs, nearest
campfire, placement collision, and similar simulation rules.
