# Minimal Spatial Game

This is the current shape for a small 2D browser game with a server-authoritative
world, `SpatialChannel2D`, client commands, and interpolated remote entities.

## Server

Create one spatial world channel:

```ts
const instance = new Instance(context)
const world = new SpatialChannel2D(instance.localState, 100, { label: 'world' })
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

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    const player = playersByUser.get(user.id)
    if (!player) {
        return
    }

    player.x += command.inputX * speedPerTick
    player.y += command.inputY * speedPerTick

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

Create a client and router:

```ts
const client = new Client(context, WebSocketClientAdapter, serverTickRate)
const interpolator = new AdaptiveInterpolator(client)
const router = new ReplicaRouter(client, { interpolator })
await client.connect('ws://localhost:8079', handshake)
```

Create renderer objects and track remote entities as interpolated:

```ts
router.onCreate(NType.Player, entity => {
    const sprite = createPlayerSprite(entity)
    router.trackEntity(entity, {
        mode: ClientEntityMode.Interpolated,
        local: sprite
    })
})
```

If the server tells the client which player it controls, switch that entity to
predicted/raw local handling:

```ts
router.onMessage(NType.YouArePlayer, message => {
    router.setMode(message.nid, ClientEntityMode.Predicted)
})
```

Each render frame:

```ts
const batch = router.processServerFrames({ maxFrames: 20 })
const sample = router.sampleInterpolated<Sprite>(100)

if (sample.state) {
    sample.entities.forEach(({ entity, tracked }) => {
        tracked.local.x = entity.x
        tracked.local.y = entity.y
    })
}

sample.exited.forEach(tracked => {
    tracked.local?.destroy()
})

client.addCommand({
    ntype: NType.MoveCommand,
    inputX,
    inputY
})
client.flush()
```

`maxFrames` chunks catch-up work but does not skip frames. If pending frames
grow too high, reconnect rather than skipping delta snapshots.

## Gameplay queries

`SpatialChannel2D` is network visibility. It is not a gameplay query engine. The
server still needs game-specific logic for gathering range, attack arcs, nearest
campfire, placement collision, and similar simulation rules.

