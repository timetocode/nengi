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
        serverTimeMs: 0,
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
    it('replays only commands that overlap its affected properties, in send order', () => {
        const client = createClient()
        const local = { x: 4, y: 0 }
        const movement = createMovement(client, local)
        client.network.store.entities.set(1, { nid: 1, ntype: 1, x: 0, y: 0 })
        movement.predict({ ntype: 2, dx: 1, dy: 0 })
        client.predictCommand({ ntype: 3, ammo: 1 }, { affected: [{ nid: 1, props: ['ammo'] }] })
        movement.predict({ ntype: 2, dx: 3, dy: 0 })

        expect(movement.getPendingCommands().map(op => op.payload.dx)).toEqual([1, 3])
        expect(movement.reconcile()?.state).toEqual({ x: 4, y: 0 })
        expect(local).toEqual({ x: 4, y: 0 })
    })

    it.each(['vx', 'z', 'grounded'])('corrects a %s change even when x and y match', prop => {
        const client = createClient()
        const local = { x: 10, y: 20, [prop]: 1 }
        const movement = new CommandReplayPrediction({
            client, nid: 1, getLocal: () => local,
            getAuthoritative: () => ({ x: 10, y: 20, [prop]: 0 }),
            applyCommand: () => {}
        })
        expect(movement.reconcile()?.corrected).toBe(true)
        expect(local[prop]).toBe(0)
    })

    it('preserves XY tolerance and ignores fields outside the replay state', () => {
        const client = createClient()
        const local = { x: 10.0001, y: 20, sprite: { color: 'blue' } }
        const movement = new CommandReplayPrediction({
            client, nid: 1, getLocal: () => local,
            getAuthoritative: () => ({ x: 10, y: 20 }), applyCommand: () => {}
        })
        expect(movement.reconcile()?.corrected).toBe(false)
        expect(local.x).toBe(10.0001)
    })

    it('includes entity-wide commands when selecting a property-scoped replay', () => {
        const client = createClient()
        const movement = createMovement(client, { x: 0, y: 0 })
        const command = { ntype: 2, dx: 1, dy: 0 }
        client.predictCommand(command, { affected: [{ nid: 1 }] })
        client.predictCommand(command, { affected: [{ nid: 2 }] })
        expect(movement.getPendingCommands().map(op => op.payload)).toEqual([command])
    })

    it('drains a pause backlog in order and reconciles once against the newest authority', () => {
        const client = createClient()
        const local = { x: 0, y: 0 }
        const movement = createMovement(client, local)
        movement.predict({ ntype: 2, dx: 10, dy: 0 })
        for (let i = 0; i < 600; i++) {
            client.network.queueSnapshot(snapshot({
                serverTimeMs: 1000 + i * 50,
                confirmedCommandFrameNumber: 1,
                messages: [{ ntype: 3, sequence: i }],
                createEntities: i === 0 ? [{ nid: 1, ntype: 1, x: 0, y: 0 }] : [],
                updateEntities: i > 0 ? [{ nid: 1, prop: 'x', value: i }] : []
            }), 1000 + i * 50)
        }
        expect(client.network.pendingFrames).toHaveLength(600)
        const frames = client.network.drainFrames()
        expect(frames.map(frame => frame.messages[0].sequence)).toEqual(Array.from({ length: 600 }, (_, i) => i))
        expect(client.network.frames).toHaveLength(client.network.maxFrameHistory)
        expect(client.network.pendingFrames).toHaveLength(0)
        expect(movement.reconcile()?.replayed).toBe(0)
        expect(local.x).toBe(599)
        expect(client.network.outbound.getUnconfirmedCommands().size).toBe(0)
    })

    it('does not correct when authority plus pending commands matches local prediction', () => {
        const client = createClient()
        const local = { x: 0, y: 0 }
        const movement = createMovement(client, local)

        movement.predict({ ntype: 2, dx: 1, dy: 0 })
        client.network.incrementCommandFrameNumber()
        movement.predict({ ntype: 2, dx: 1, dy: 0 })

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1000,
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
            serverTimeMs: 1000,
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
