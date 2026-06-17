# Minimal Spatial Game

This is the current shape for a small 2D browser game with a server-authoritative
world, `SpatialChannel2D`, client commands, and interpolated remote entities.

For package setup, TypeScript, Vite, and local workspace imports, use
[local-prototype.md](./local-prototype.md). This file only describes the nengi
gameplay shape.

## Server

Create one spatial world channel:

```ts
const instance = new Instance(context)
const world = new SpatialChannel2D(instance.localState, 100, { name: 'world' })
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

Create a client and replica:

```ts
const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const interpolator = new AdaptiveInterpolator(client)
const replica = new ClientReplica(client, { interpolator })
await client.connect('ws://localhost:8079', handshake)
```

Bind remote entities as interpolated:

```ts
replica.bindEntity<PlayerEntity, Sprite>(NType.Player, {
    mode: ClientEntityMode.Interpolated,
    create: entity => createPlayerSprite(entity),
    sample: (entity, sprite) => {
        sprite.x = entity.x
        sprite.y = entity.y
    },
    destroy: sprite => sprite.destroy()
})
```

If the server tells the client which player it controls, switch that entity to
predicted/raw local handling:

```ts
replica.onMessage(NType.YouArePlayer, message => {
    replica.setMode(message.nid, ClientEntityMode.Predicted)
})
```

Each render frame. This example sends commands at a fixed 30 Hz command rate
even if the renderer runs faster or slower:

```ts
const COMMAND_INTERVAL_MS = 1000 / 30
let commandAccumulatorMs = 0

function frame(dtMs: number) {
    replica.process({ maxFrames: 20 })
    const sample = replica.sampleInterpolated(100)
    replica.applyInterpolatedSample(sample)

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

## Gameplay queries

`SpatialChannel2D` is network visibility. It is not a gameplay query engine. The
server still needs game-specific logic for gathering range, attack arcs, nearest
campfire, placement collision, and similar simulation rules.
