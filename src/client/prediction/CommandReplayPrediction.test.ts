import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { Client } from '../Client'
import { CommandReplayPrediction } from './CommandReplayPrediction'
import { testBinaryAdapter } from '../../testSupport/BufferBinary'

class MockAdapter {
    binary = testBinaryAdapter
    constructor() {
    }
    connect() {
        return Promise.resolve({ accepted: true })
    }
    flush() {
    }
}

function createClient() {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64
    }))
    return new Client(context, MockAdapter, 20)
}

type MoveCommand = {
    ntype: number
    dx: number
    dy: number
}

function createMovement(client: Client, local: { x: number, y: number }) {
    return new CommandReplayPrediction({
        client,
        nid: 1,
        getLocal: () => local,
        getAuthoritative: () => client.network.store.get(1) as { x: number, y: number } | undefined,
        createReplayState: authoritative => ({ x: authoritative.x, y: authoritative.y }),
        applyCommand: (state: any, command: MoveCommand) => {
            state.x += command.dx
            state.y += command.dy
        },
        applyReplayState: (local, replayState) => {
            local.x = replayState.x
            local.y = replayState.y
        },
        affectedProps: ['x', 'y']
    })
}

describe('CommandReplayPrediction', () => {
    it('does not correct when authority plus pending commands matches local prediction', () => {
        const client = createClient()
        const local = { x: 0, y: 0 }
        const movement = createMovement(client, local)

        movement.predict({ ntype: 2, dx: 1, dy: 0 })
        client.network.incrementClientTick()
        movement.predict({ ntype: 2, dx: 1, dy: 0 })

        client.network.queueSnapshot({
            timestamp: 1000,
            confirmedClientTick: 1,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, y: 0 }],
            updateEntities: [],
            deleteEntities: []
        }, 1000)
        client.network.processNextFrame()

        const correction = movement.reconcile()

        expect(correction).toEqual({
            corrected: false,
            error: 0,
            replayed: 1,
            state: { x: 2, y: 0 }
        })
        expect(local).toEqual({ x: 2, y: 0 })
    })

    it('corrects to authoritative state when the server rejected predicted movement', () => {
        const client = createClient()
        const local = { x: 0, y: 0 }
        const movement = createMovement(client, local)

        movement.predict({ ntype: 2, dx: 1, dy: 0 })

        client.network.queueSnapshot({
            timestamp: 1000,
            confirmedClientTick: 1,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0 }],
            updateEntities: [],
            deleteEntities: []
        }, 1000)
        client.network.processNextFrame()

        const correction = movement.reconcile()

        expect(correction?.corrected).toBe(true)
        expect(correction?.error).toBe(1)
        expect(correction?.replayed).toBe(0)
        expect(local).toEqual({ x: 0, y: 0 })
    })
})
