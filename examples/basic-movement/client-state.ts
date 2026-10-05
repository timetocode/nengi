import type { AdaptiveInterpolator, Client, Frame } from 'nengi'
import { NType } from './protocol.ts'
import type { Player } from './protocol.ts'

export function createPresentation() {
    return {
        roomId: undefined as number | undefined,
        controlledNid: undefined as number | undefined,
        players: new Map<number, Player>()
    }
}

export type Presentation = ReturnType<typeof createPresentation>

export function applyFrame(state: Presentation, frame: Frame) {
    // Close facts belong to the old channel; an open can reuse its id.
    for (const channel of frame.closedChannels) {
        if (channel.channelId === state.roomId) {
            state.players.clear()
            state.roomId = undefined
        }
    }
    for (const channel of frame.openedChannels) {
        if (channel.header.name === 'room') state.roomId = channel.channelId
    }
    for (const message of frame.messages) {
        if (message.ntype === NType.YouAre) state.controlledNid = message.nid
    }

    const room = state.roomId === undefined ? undefined : frame.getChannel(state.roomId)
    if (!room) return

    for (const entity of room.createEntities) {
        if (entity.ntype !== NType.Player) continue
        // All fields here are primitives. Presentation owns this copy.
        state.players.set(entity.nid, {
            nid: entity.nid, ntype: NType.Player,
            x: entity.x, y: entity.y, hue: entity.hue
        })
    }
    for (const deleted of room.deletedEntities) state.players.delete(deleted.nid)
}

export function updatePresentation(client: Client, interpolator: AdaptiveInterpolator, state: Presentation) {
    let frame: Frame | null
    while ((frame = client.network.processNextFrame()) !== null) applyFrame(state, frame)

    // 100 ms is the requested base delay; the adaptive policy can adjust it.
    // Include the controlled player: this starter has no local movement simulation.
    const sample = interpolator.sampleEntities(state.players.keys(), 100)
    for (const entity of sample.entities.values()) {
        const player = state.players.get(entity.nid)
        if (player) {
            player.x = entity.x
            player.y = entity.y
        }
    }
}
