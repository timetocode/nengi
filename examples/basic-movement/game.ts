import { Channel, CommandRouter, Instance, NetworkEvent, UserConnectionState } from 'nengi'
import {
    NType, PLAYER_RADIUS, ROOM_HEIGHT, ROOM_WIDTH, SERVER_TICK_RATE,
    createContext, createPlayer
} from './protocol.ts'
import type { MoveTo, Player } from './protocol.ts'

type Point = { x: number, y: number }
type PlayerState = { entity: Player, target: Point }
const SPEED = 180

// Pure movement calculation. The tick below owns the state mutation.
function moveTowards(position: Point, target: Point, distance: number): Point {
    const dx = target.x - position.x
    const dy = target.y - position.y
    const remaining = Math.hypot(dx, dy)
    if (remaining <= distance) return { x: target.x, y: target.y }

    return {
        x: position.x + dx / remaining * distance,
        y: position.y + dy / remaining * distance
    }
}

export function createGame() {
    const instance = new Instance(createContext())
    instance.onConnect = async () => true

    // Everyone in this small room sees everyone else, so no spatial channel is needed.
    const room = new Channel(instance.localState, { name: 'room' })
    const players = new Map<number, PlayerState>()
    const commands = new CommandRouter()

    commands.on<MoveTo>(NType.MoveTo, ({ user, command }) => {
        const player = players.get(user.id)
        if (!player || !Number.isFinite(command.x) || !Number.isFinite(command.y)) return

        // The client supplies a destination, never an entity id or movement speed.
        player.target = {
            x: Math.max(PLAYER_RADIUS, Math.min(ROOM_WIDTH - PLAYER_RADIUS, command.x)),
            y: Math.max(PLAYER_RADIUS, Math.min(ROOM_HEIGHT - PLAYER_RADIUS, command.y))
        }
    })

    function tick() {
        while (!instance.queue.isEmpty()) {
            const event = instance.queue.next()
            if (event.type === NetworkEvent.UserConnected) {
                // The transport may have closed between acceptance and this tick.
                if (event.user.connectionState !== UserConnectionState.Open) continue

                const entity = createPlayer(event.user.id)
                room.addEntity(entity)
                players.set(event.user.id, { entity, target: { x: entity.x, y: entity.y } })
                room.subscribe(event.user)
                event.user.queueMessage({ ntype: NType.YouAre, nid: entity.nid })
            } else if (event.type === NetworkEvent.UserDisconnected) {
                const player = players.get(event.user.id)
                if (player) room.removeEntity(player.entity)
                players.delete(event.user.id)
            } else {
                commands.process(event)
            }
        }

        for (const { entity, target } of players.values()) {
            const next = moveTowards(entity, target, SPEED / SERVER_TICK_RATE)
            entity.x = next.x
            entity.y = next.y
        }

        instance.step()
    }

    function dispose() {
        players.clear()
        room.destroy()
    }

    return { instance, room, players, tick, dispose }
}
