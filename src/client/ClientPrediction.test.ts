import { Binary } from '../common/binary/Binary'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client } from './Client'

class MockAdapter {
    constructor() {
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

describe('client prediction', () => {
    it('sends predicted commands and resolves them when their client tick is confirmed', () => {
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
        expect(client.network.outbound.getCommands(0)).toEqual([{ ntype: 2, dx: 1 }])
        expect(client.predictor.log.getPendingCommands().map(op => op.id)).toEqual([operation!.id])
        expect(operation!.clientTick).toBe(1)

        client.network.queueSnapshot({
            timestamp: 1000,
            confirmedClientTick: 1,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1 }],
            updateEntities: [],
            deleteEntities: []
        }, 1000)
        client.network.processNextFrame()

        expect(client.predictor.log.getPendingCommands()).toEqual([])
        expect(events).toEqual(['accepted'])
    })

    it('emits state reconciliation from confirmed ticks even when the snapshot has no update', () => {
        const client = createClient()
        const localDoor = { open: false }
        const events: string[] = []

        client.network.queueSnapshot({
            timestamp: 1000,
            confirmedClientTick: 0,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0 }],
            updateEntities: [],
            deleteEntities: []
        }, 1000)
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

        client.network.queueSnapshot({
            timestamp: 1050,
            confirmedClientTick: 1,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }, 1050)
        client.network.processNextFrame()

        expect(localDoor.open).toBe(false)
        expect(events).toEqual(['1:1:0:1'])
        expect(client.predictor.log.getPendingOperations()).toEqual([])
    })

    it('compares only the latest confirmed expected state per prop', () => {
        const client = createClient()
        const mismatchCounts: number[] = []

        client.network.queueSnapshot({
            timestamp: 1000,
            confirmedClientTick: 0,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0 }],
            updateEntities: [],
            deleteEntities: []
        }, 1000)
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

        client.network.queueSnapshot({
            timestamp: 1050,
            confirmedClientTick: 1,
            messages: [],
            createEntities: [],
            updateEntities: [{ nid: 1, prop: 'x', value: 2 }],
            deleteEntities: []
        }, 1050)
        client.network.processNextFrame()

        expect(mismatchCounts).toEqual([0])
    })

    it('lets ammo reconciliation replay pending spends from authoritative state', () => {
        const client = createClient()
        const localPlayer = { semiAmmo: 6, autoAmmo: 22 }
        const events: string[] = []

        client.network.queueSnapshot({
            timestamp: 1000,
            confirmedClientTick: 0,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0, semiAmmo: 6, autoAmmo: 22 }],
            updateEntities: [],
            deleteEntities: []
        }, 1000)
        client.network.processNextFrame()

        client.predictor.onReconcile(event => {
            const pending = event.pending.slice().sort((a, b) => a.clientTick - b.clientTick || a.id - b.id)
            let semiAmmo = event.authority.semiAmmo
            for (let i = 0; i < pending.length; i++) {
                if (pending[i].payload?.kind === 'ammo-spend') {
                    semiAmmo = Math.max(0, semiAmmo - 1)
                }
            }
            localPlayer.semiAmmo = semiAmmo
            events.push(`${event.mismatches.length}:${event.authority.semiAmmo}:${semiAmmo}:${pending.length}`)
            event.dropConfirmed()
        })

        client.predictState({ kind: 'ammo-spend', weapon: 1, seq: 1 }, {
            affected: [{ nid: 1, props: ['semiAmmo'] }],
            expected: [{ nid: 1, values: { semiAmmo: 5 } }],
            applyLocal: () => {
                localPlayer.semiAmmo = 5
            }
        })
        client.network.incrementClientTick()
        client.predictState({ kind: 'ammo-spend', weapon: 1, seq: 2 }, {
            affected: [{ nid: 1, props: ['semiAmmo'] }],
            expected: [{ nid: 1, values: { semiAmmo: 4 } }],
            applyLocal: () => {
                localPlayer.semiAmmo = 4
            }
        })
        client.network.incrementClientTick()
        client.predictState({ kind: 'ammo-spend', weapon: 1, seq: 3 }, {
            affected: [{ nid: 1, props: ['semiAmmo'] }],
            expected: [{ nid: 1, values: { semiAmmo: 3 } }],
            applyLocal: () => {
                localPlayer.semiAmmo = 3
            }
        })

        client.network.queueSnapshot({
            timestamp: 1050,
            confirmedClientTick: 2,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }, 1050)
        client.network.processNextFrame()

        expect(localPlayer.semiAmmo).toBe(5)
        expect(events).toEqual(['1:6:5:1'])
        expect(client.predictor.log.getPendingOperations()).toHaveLength(1)
    })
})
