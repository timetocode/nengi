import { Binary } from '../common/binary/Binary'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client } from './Client'
import { StateReplayPrediction } from './prediction/StateReplayPrediction'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { ChannelType, createChannelHeader } from '../common/ChannelHeader'
import type { Snapshot } from './Snapshot'

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
        semiAmmo: Binary.UInt16,
        autoAmmo: Binary.UInt16
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

describe('client prediction', () => {
    it.each([false, true])('rebuilds pending expectations after a rejected spend (callback=%s)', callback => {
        const client = createClient()
        const local = { semiAmmo: 10 }
        const reused = { semiAmmo: 0 }
        const ammo = new StateReplayPrediction({
            client, nid: 1, getLocal: () => local, affectedProps: ['semiAmmo'],
            createReplayState: authority => ({ semiAmmo: authority.semiAmmo }),
            applyPayload: (state, payload: { spent: number }) => { state.semiAmmo -= payload.spent },
            expectedValues: callback ? (state, payload) => {
                reused.semiAmmo = state.semiAmmo - payload.spent
                return reused
            } : undefined
        })
        client.network.queueSnapshot(snapshot({
            createEntities: [{ nid: 1, ntype: 1, x: 0, semiAmmo: 10, autoAmmo: 0 }],
            confirmedCommandFrameNumber: 0
        }), 1000)
        client.network.processNextFrame()
        const operations = [1, 2, 3].map(() => {
            const payload = Object.freeze({ spent: 1 })
            const op = ammo.predict(payload, callback ? undefined : { semiAmmo: local.semiAmmo - 1 })!
            client.network.incrementCommandFrameNumber()
            return op
        })
        expect(operations.map(op => op.options.expected![0].values.semiAmmo)).toEqual([9, 8, 7])
        const mismatches: number[] = []
        client.predictor.onReconcile(event => {
            mismatches.push(event.mismatches.length)
            ammo.reconcile(event)
        })
        // First spend rejected. Later inputs must be predicted again from 10.
        client.network.queueSnapshot(snapshot({ confirmedCommandFrameNumber: 1 }), 1050)
        client.network.processNextFrame()
        expect(local.semiAmmo).toBe(8)
        expect(operations.slice(1).map(op => op.options.expected![0].values.semiAmmo)).toEqual([9, 8])
        for (const [frame, value] of [[2, 9], [3, 8]]) {
            client.network.queueSnapshot(snapshot({
                confirmedCommandFrameNumber: frame,
                updateEntities: [{ nid: 1, prop: 'semiAmmo', value }]
            }), 1050 + frame * 50)
            client.network.processNextFrame()
        }
        expect(mismatches).toEqual([1, 0, 0])
        expect(local.semiAmmo).toBe(8)
        expect(operations.every(op => op.payload.spent === 1)).toBe(true)
    })

    it.each([false, true])('coalesces overlapping and wildcard expectations across skipped confirmations (wildcard=%s)', wildcard => {
        const client = createClient()
        client.predictState({}, {
            affected: [{ nid: 1, props: ['x'] }],
            expected: [{ nid: 1, values: { x: 1 } }]
        })
        client.network.incrementCommandFrameNumber()
        client.predictState({}, {
            affected: [{ nid: 1, props: wildcard ? undefined : ['x', 'semiAmmo'] }],
            expected: [{ nid: 1, values: { x: 0, semiAmmo: 9 } }]
        })
        const handler = jest.fn(event => {
            expect(event.confirmed).toHaveLength(2)
            expect(event.mismatches).toEqual([])
            event.dropConfirmed()
        })
        client.predictor.onReconcile(handler)
        client.network.queueSnapshot(snapshot({
            confirmedCommandFrameNumber: 7,
            createEntities: [{ nid: 1, ntype: 1, x: 0, semiAmmo: 9, autoAmmo: 0 }]
        }), 1000)
        client.network.processNextFrame()
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('keeps disjoint state payloads out of a helper replay', () => {
        const client = createClient()
        const local = { semiAmmo: 6 }
        const ammo = new StateReplayPrediction({
            client, nid: 1, getLocal: () => local,
            getAuthoritative: () => ({ semiAmmo: 6 }),
            affectedProps: ['semiAmmo'],
            applyPayload: (state, payload: { spent: number }) => { state.semiAmmo -= payload.spent }
        })
        ammo.predict({ spent: 1 })
        client.predictState({ dx: 10 }, { affected: [{ nid: 1, props: ['x'] }] })
        expect(ammo.reconcile()?.replayed).toBe(1)
        expect(local.semiAmmo).toBe(5)
    })

    it('replays all helper properties when an event confirms only one of them', () => {
        const client = createClient()
        const local = { semiAmmo: 6, autoAmmo: 22 }
        const ammo = new StateReplayPrediction({
            client, nid: 1, getLocal: () => local,
            createReplayState: authority => ({ semiAmmo: authority.semiAmmo, autoAmmo: authority.autoAmmo }),
            affectedProps: ['semiAmmo', 'autoAmmo'],
            applyPayload: (state, payload: { prop: 'semiAmmo' | 'autoAmmo' }) => { state[payload.prop]-- }
        })
        client.network.queueSnapshot(snapshot({
            createEntities: [{ nid: 1, ntype: 1, x: 0, semiAmmo: 6, autoAmmo: 22 }],
            confirmedCommandFrameNumber: 0
        }), 1000)
        client.network.processNextFrame()
        client.predictState({ prop: 'semiAmmo' }, { affected: [{ nid: 1, props: ['semiAmmo'] }] })
        client.network.incrementCommandFrameNumber()
        client.predictState({ prop: 'autoAmmo' }, { affected: [{ nid: 1, props: ['autoAmmo'] }] })
        client.predictor.onReconcile(event => { ammo.reconcile(event) })
        client.network.queueSnapshot(snapshot({ confirmedCommandFrameNumber: 1 }), 1050)
        client.network.processNextFrame()
        expect(local).toEqual({ semiAmmo: 6, autoAmmo: 21 })
    })

    it('ignores reconciliation events for unrelated properties on the same entity', () => {
        const client = createClient()
        const local = { semiAmmo: 5 }
        const ammo = new StateReplayPrediction({
            client, nid: 1, getLocal: () => local, affectedProps: ['semiAmmo'],
            createReplayState: authority => ({ semiAmmo: authority.semiAmmo }),
            applyPayload: () => {}
        })
        const op = client.predictState({ dx: 10 }, { affected: [{ nid: 1, props: ['x'] }] })
        client.predictor.onReconcile(event => { expect(ammo.reconcile(event)).toBeNull() })
        client.network.queueSnapshot(snapshot({
            createEntities: [{ nid: 1, ntype: 1, x: 10, semiAmmo: 6, autoAmmo: 22 }],
            confirmedCommandFrameNumber: 1
        }), 1000)
        client.network.processNextFrame()
        expect(local.semiAmmo).toBe(5)
        expect(client.predictor.log.operations.has(op.id)).toBe(true)
    })

    it('sends predicted commands and resolves them when their command frame number is confirmed', () => {
        const client = createClient()
        const localPlayer = { x: 0 }
        const events: string[] = []

        const operation = client.predictCommand({ ntype: 2, dx: 1 }, {
            affected: [{ nid: 1, props: ['x'] }],
            applyLocal: () => {
                localPlayer.x += 1
            },
            validate: ({ store }) => store!.get(1)?.x === localPlayer.x,
            reconcile: ({ accepted }) => {
                events.push(accepted ? 'accepted' : 'rejected')
            }
        })

        expect(localPlayer.x).toBe(1)
        expect(client.network.outbound.getCommands(1)).toEqual([{ ntype: 2, dx: 1 }])
        expect(client.predictor.log.getPendingCommands().map(op => op.id)).toEqual([operation!.id])
        expect(operation!.commandFrameNumber).toBe(1)

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1000,
            confirmedCommandFrameNumber: 1,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1 }],
            updateEntities: [],
            deleteEntities: []
        }), 1000)
        client.network.processNextFrame()

        expect(client.predictor.log.getPendingCommands()).toEqual([])
        expect(events).toEqual(['accepted'])
    })

    it('emits state reconciliation from confirmed ticks even when the snapshot has no update', () => {
        const client = createClient()
        const localDoor = { open: false }
        const events: string[] = []

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1000,
            confirmedCommandFrameNumber: 0,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0 }],
            updateEntities: [],
            deleteEntities: []
        }), 1000)
        client.network.processNextFrame()

        client.predictor.onReconcile(event => {
            events.push(`${event.target.nid}:${event.confirmed.length}:${event.pending.length}:${event.mismatches.length}`)
            expect(event.authority.x).toBe(0)
            expect(event.mismatches[0]).toEqual(expect.objectContaining({
                nid: 1,
                prop: 'x',
                expected: 1,
                authoritative: 0
            }))
            localDoor.open = event.authority.x === 1
            event.dropConfirmed()
        })

        client.predictState({ open: true }, {
            affected: [{ nid: 1, props: ['x'] }],
            expected: [{ nid: 1, values: { x: 1 } }],
            applyLocal: () => {
                localDoor.open = true
            }
        })

        expect(localDoor.open).toBe(true)

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1050,
            confirmedCommandFrameNumber: 1,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }), 1050)
        client.network.processNextFrame()

        expect(localDoor.open).toBe(false)
        expect(events).toEqual(['1:1:0:1'])
        expect(client.predictor.log.getPendingOperations()).toEqual([])
    })

    it('compares only the latest confirmed expected state per prop', () => {
        const client = createClient()
        const mismatchCounts: number[] = []

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1000,
            confirmedCommandFrameNumber: 0,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0 }],
            updateEntities: [],
            deleteEntities: []
        }), 1000)
        client.network.processNextFrame()

        client.predictor.onReconcile(event => {
            mismatchCounts.push(event.mismatches.length)
            event.dropConfirmed()
        })

        client.predictState({ step: 1 }, {
            affected: [{ nid: 1, props: ['x'] }],
            expected: [{ nid: 1, values: { x: 1 } }]
        })
        client.predictState({ step: 2 }, {
            affected: [{ nid: 1, props: ['x'] }],
            expected: [{ nid: 1, values: { x: 2 } }]
        })

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1050,
            confirmedCommandFrameNumber: 1,
            messages: [],
            createEntities: [],
            updateEntities: [{ nid: 1, prop: 'x', value: 2 }],
            deleteEntities: []
        }), 1050)
        client.network.processNextFrame()

        expect(mismatchCounts).toEqual([0])
    })

    it('lets ammo reconciliation replay pending spends from authoritative state', () => {
        const client = createClient()
        const localPlayer = { semiAmmo: 6, autoAmmo: 22 }
        const events: string[] = []
        const ammoPrediction = new StateReplayPrediction({
            client,
            nid: 1,
            getLocal: () => localPlayer,
            createReplayState: authority => ({
                semiAmmo: authority.semiAmmo,
                autoAmmo: authority.autoAmmo
            }),
            applyPayload: (state, payload: any) => {
                if (payload.kind === 'ammo-spend') {
                    state.semiAmmo = Math.max(0, state.semiAmmo - 1)
                }
            },
            applyReplayState: (local, replayState) => {
                local.semiAmmo = replayState.semiAmmo
                local.autoAmmo = replayState.autoAmmo
            },
            affectedProps: ['semiAmmo']
        })

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1000,
            confirmedCommandFrameNumber: 0,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0, semiAmmo: 6, autoAmmo: 22 }],
            updateEntities: [],
            deleteEntities: []
        }), 1000)
        client.network.processNextFrame()

        client.predictor.onReconcile(event => {
            const correction = ammoPrediction.reconcile(event)!
            events.push(`${correction.mismatches}:${event.authority.semiAmmo}:${localPlayer.semiAmmo}:${correction.replayed}`)
        })

        ammoPrediction.predict({ kind: 'ammo-spend', weapon: 1, seq: 1 }, { semiAmmo: 5 })
        client.network.incrementCommandFrameNumber()
        ammoPrediction.predict({ kind: 'ammo-spend', weapon: 1, seq: 2 }, { semiAmmo: 4 })
        client.network.incrementCommandFrameNumber()
        ammoPrediction.predict({ kind: 'ammo-spend', weapon: 1, seq: 3 }, { semiAmmo: 3 })

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1050,
            confirmedCommandFrameNumber: 2,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }), 1050)
        client.network.processNextFrame()

        expect(localPlayer.semiAmmo).toBe(5)
        expect(events).toEqual(['1:6:5:1'])
        expect(client.predictor.log.getPendingOperations()).toHaveLength(1)
    })

    it('confirms prediction with monotonic command frame numbers', () => {
        const client = createClient()
        const events: string[] = []

        client.network.commandFrameNumber = 65535
        client.network.outbound.tick = 65535

        const first = client.predictCommand({ ntype: 2, dx: 1 }, {
            reconcile: () => events.push('first')
        })
        client.network.incrementCommandFrameNumber()
        const second = client.predictCommand({ ntype: 2, dx: 2 }, {
            reconcile: () => events.push('second')
        })

        expect(first!.commandFrameNumber).toBe(65535)
        expect(second!.commandFrameNumber).toBe(65536)
        expect(client.network.commandFrameNumber).toBe(65536)

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1050,
            confirmedCommandFrameNumber: 65536,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }), 1050)
        client.network.processNextFrame()

        expect(events).toEqual(['first', 'second'])
        expect(client.predictor.log.getPendingCommands()).toEqual([])
    })

    it('keeps later command predictions and outbound commands pending after a stale confirmation', () => {
        const client = createClient()
        const events: string[] = []

        const first = client.predictCommand({ ntype: 2, dx: 1 }, {
            reconcile: () => events.push('first')
        })
        client.network.incrementCommandFrameNumber()
        client.network.outbound.tick = client.network.commandFrameNumber
        const second = client.predictCommand({ ntype: 2, dx: 2 }, {
            reconcile: () => events.push('second')
        })

        expect(first!.commandFrameNumber).toBe(1)
        expect(second!.commandFrameNumber).toBe(2)
        expect(client.network.outbound.getUnconfirmedCommands().has(1)).toBe(true)
        expect(client.network.outbound.getUnconfirmedCommands().has(2)).toBe(true)

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1050,
            confirmedCommandFrameNumber: 1,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }), 1050)
        client.network.processNextFrame()

        expect(events).toEqual(['first'])
        expect(client.predictor.log.getPendingCommands().map(op => op.id)).toEqual([second!.id])
        expect(client.network.outbound.getUnconfirmedCommands().has(1)).toBe(false)
        expect(client.network.outbound.getUnconfirmedCommands().has(2)).toBe(true)

        client.network.queueSnapshot(snapshot({
            serverTimeMs: 1100,
            confirmedCommandFrameNumber: 2,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }), 1100)
        client.network.processNextFrame()

        expect(events).toEqual(['first', 'second'])
        expect(client.predictor.log.getPendingCommands()).toEqual([])
        expect(client.network.outbound.getUnconfirmedCommands().has(2)).toBe(false)
    })
})
