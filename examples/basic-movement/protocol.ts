import { Binary, Context, defineEntitySchema, defineMessageSchema } from 'nengi'

// This is the snapshot frequency, shared by Instance.step() and Client.
export const SERVER_TICK_RATE = 20
export const ROOM_WIDTH = 800
export const ROOM_HEIGHT = 500
export const PLAYER_RADIUS = 16

export enum NType {
    Player = 1,
    MoveTo = 2,
    YouAre = 3
}

export type Player = {
    nid: number
    ntype: NType.Player
    x: number
    y: number
    hue: number
}

const PlayerSchema = defineEntitySchema({
    x: { type: Binary.Float32, interp: true },
    y: { type: Binary.Float32, interp: true },
    hue: Binary.UInt16
})

export function createPlayer(userId: number): Player {
    return {
        nid: 0,
        ntype: NType.Player,
        x: 80 + (userId % 6) * 100,
        y: ROOM_HEIGHT / 2,
        hue: (userId * 137) % 360
    }
}

export type MoveTo = {
    ntype: NType.MoveTo
    x: number
    y: number
}

const MoveToSchema = defineMessageSchema({ x: Binary.Float32, y: Binary.Float32 })
const YouAreSchema = defineMessageSchema({ nid: Binary.UInt32 })

export function createContext() {
    const context = new Context()
    context.register(NType.Player, PlayerSchema)
    context.register(NType.MoveTo, MoveToSchema)
    context.register(NType.YouAre, YouAreSchema)
    return context
}
