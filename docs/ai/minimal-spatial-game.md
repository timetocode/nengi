# Minimal spatial game

Start with the complete [shared room starter](./getting-started.md). Its `Channel`
is appropriate while every subscriber sees every player. When visibility should
follow each player's position, make the following changes to its `game.ts`.
These are the spatial-specific differences; retain its connection handling,
command validation, schemas and client lifecycle.

## Create a spatial channel

Replace the `Channel` import and construction with:

```ts
import { Channel2D } from 'nengi'

const room = new Channel2D(instance.localState, 100, { name: 'room' })

function viewFor(player: Player) {
    return { x: player.x, y: player.y, halfWidth: 200, halfHeight: 150 }
}
```

The cell size is 100 world units. The view is a rectangle centered on the player;
its dimensions are visibility bounds, not the browser viewport size.

On connection, replace the plain subscription with:

```ts
room.subscribe(event.user, viewFor(entity))
```

## Update membership when moving

Replace the starter's movement loop with:

```ts
for (const [userId, { entity, target }] of players) {
    const next = moveTowards(entity, target, SPEED / SERVER_TICK_RATE)
    if (next.x === entity.x && next.y === entity.y) continue

    entity.x = next.x
    entity.y = next.y
    room.moveEntity(entity)

    const user = instance.users.get(userId)
    if (user?.connectionState === UserConnectionState.Open) {
        room.updateView(user, viewFor(entity))
    }
}
```

Automatic property diffing observes `x` and `y`. `moveEntity` separately updates
cell membership and visibility; `updateView` moves the observer's interest area.
Use both at the corresponding mutation boundary. See
[spatial channels](./spatial-channels.md) for 3D, projected planes and manual writes.

## Keep the client lifecycle

The starter's channel name remains `room`, so its client routing stays valid.
Entering another player's view produces a create; leaving it produces a delete
for that observer even though the entity still exists on the server. Do not
interpret every disappearance as death or destruction.

The non-predicting client interpolates all visible players, including its own.
A fixed-size world view is enough to test culling: connect two tabs and move
apart. For a larger world, adjust the starter's room bounds and add a camera.
Network visibility and camera rendering are separate decisions.

Do not introduce a fixed distance per received command unless the application's
input timing contract justifies it and the server enforces the corresponding
budget. The starter uses destination commands and server-driven movement. For
instant direct controls, use the [action prediction model](./realtime-movement-prediction.md)
with matching command durations on both peers instead.

## Gameplay queries

`Channel2D` defines network visibility. It is not a gameplay query engine. The
server still needs logic for range, attack arcs, gathering, collision and
permission checks. Being visible does not authorize an interaction.
