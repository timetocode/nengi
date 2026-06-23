import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ChannelType, createChannelHeader } from '../../common/ChannelHeader'
import { Client } from '../Client'
import { CommandReplayPrediction } from './CommandReplayPrediction'
import { testBinaryAdapter } from '../../testSupport/BufferBinary'
import type { Snapshot } from '../Snapshot'

const TEST_CHANNEL_ID = 1

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

function snapshot(args: Partial<Snapshot>): Snapshot {
    const createEntities = args.createEntities || []
    const updateEntities = args.updateEntities || []
    const deleteEntities = args.deleteEntities || []
    const hasEntityCrud = createEntities.length > 0 || updateEntities.length > 0 || deleteEntities.length > 0
    return {
        timestamp: -1,
        confirmedCommandFrameNumber: -1,
        messages: [],
        ...args,
        channelOpens: hasEntityCrud
            ? [{ channelId: TEST_CHANNEL_ID, header: createChannelHeader(TEST_CHANNEL_ID, ChannelType.Channel) }]
            : [],
        channels: hasEntityCrud ? [{
            channelId: TEST_CHANNEL_ID,
            messages: [],
            interpolatedMessages: [],
            ecsCreateEntities: [],
            ecsCreateComponents: [],
            ecsDeleteEntities: [],
            createEntities,
            updateEntities,
            updateEntityGroups: [],
            deleteEntities
        }] : [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: []
    }
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
        client.network.incrementCommandFrameNumber()
        movement.predict({ ntype: 2, dx: 1, dy: 0 })

        client.network.queueSnapshot(snapshot({
            timestamp: 1000,
            confirmedCommandFrameNumber: 1,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, y: 0 }],
            updateEntities: [],
            deleteEntities: []
        }), 1000)
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

        client.network.queueSnapshot(snapshot({
            timestamp: 1000,
            confirmedCommandFrameNumber: 1,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0 }],
            updateEntities: [],
            deleteEntities: []
        }), 1000)
        client.network.processNextFrame()

        const correction = movement.reconcile()

        expect(correction?.corrected).toBe(true)
        expect(correction?.error).toBe(1)
        expect(correction?.replayed).toBe(0)
        expect(local).toEqual({ x: 0, y: 0 })
    })
})
