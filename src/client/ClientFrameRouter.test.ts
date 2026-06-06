import { Binary } from '../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client } from './Client'
import { ClientEntityMode, ClientFrameRouter, ClientStateRouter } from './ClientFrameRouter'
import { AdaptiveInterpolator, InterpolationStatus } from './FixedStepInterpolator'
import { Snapshot } from './Snapshot'

class MockAdapter {
    constructor() {
    }
}

function createClient() {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: { type: Binary.Float64, interp: true },
        y: { type: Binary.Float64, interp: true },
        label: Binary.String
    }))
    context.register(2, defineMessageSchema({
        nid: Binary.UInt32
    }))
    return new Client(context, MockAdapter, 20)
}

function snapshot(args: Partial<Snapshot>): Snapshot {
    return {
        timestamp: -1,
        confirmedClientTick: -1,
        messages: [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: [],
        ...args
    }
}

function applySnapshot(client: Client, data: Snapshot) {
    const receivedAt = data.timestamp === -1 ? 1000 + (client.network.getPendingFrameCount() * 50) : data.timestamp
    client.network.queueSnapshot(data, receivedAt)
    client.network.previousSnapshot = data
}

describe('ClientFrameRouter', () => {
    it('supports the ClientStateRouter and AdaptiveInterpolator public names', () => {
        const client = createClient()
        const router = new ClientStateRouter(client, {
            interpolator: new AdaptiveInterpolator(client, {
                minDelayMs: 25
            })
        })

        expect(router).toBeInstanceOf(ClientStateRouter)
        expect(router.interpolator.options.mode).toBe('adaptive')
        expect(router.interpolator.options.minMs).toBe(25)
    })

    it('routes raw frame lifecycle and exposes changed ids', () => {
        const client = createClient()
        const router = new ClientFrameRouter(client, { defaultMode: ClientEntityMode.Raw })
        const events: string[] = []

        router.onCreate(1, entity => events.push(`create:${entity.nid}`))
        router.onUpdate(1, update => events.push(`update:${update.nid}:${update.prop}`))
        router.onDelete(1, nid => events.push(`delete:${nid}`))
        router.onMessage(2, message => events.push(`message:${message.nid}`))

        applySnapshot(client, snapshot({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }],
            messages: [{ ntype: 2, nid: 1 }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1100,
            deleteEntities: [1]
        }))

        const batch = router.process()

        expect(events).toEqual(['create:1', 'message:1', 'update:1:x', 'delete:1'])
        expect(Array.from(batch.changedNids)).toEqual([1])
        expect(batch.createEntities.length).toBe(1)
        expect(batch.updateEntities.length).toBe(1)
        expect(batch.deleteEntities).toEqual([1])
        expect(router.getRaw(1)).toBeUndefined()
        expect(router.getLastConfirmedClientTick()).toBe(-1)
    })

    it('applies and routes queued frames in deterministic chunks', () => {
        const client = createClient()
        const router = new ClientFrameRouter(client, { defaultMode: ClientEntityMode.Raw })
        const rawXDuringUpdates: number[] = []

        router.onUpdate(1, () => {
            rawXDuringUpdates.push(router.getRaw(1)!.x)
        })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1100,
            updateEntities: [{ nid: 1, prop: 'x', value: 20 }]
        }))

        const firstBatch = router.process({ maxFrames: 2 })

        expect(firstBatch.frames.map(frame => frame.tick)).toEqual([1, 2])
        expect(rawXDuringUpdates).toEqual([10])
        expect(router.getRaw(1)!.x).toBe(10)
        expect(client.network.getPendingFrameCount()).toBe(1)

        const secondBatch = router.process({ maxFrames: 2 })

        expect(secondBatch.frames.map(frame => frame.tick)).toEqual([3])
        expect(rawXDuringUpdates).toEqual([10, 20])
        expect(router.getRaw(1)!.x).toBe(20)
        expect(client.network.getPendingFrameCount()).toBe(0)
    })

    it('keeps interpolated entities tracked after raw delete until render-time exit', () => {
        const client = createClient()
        const router = new ClientFrameRouter(client, { defaultMode: ClientEntityMode.Interpolated })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 10, y: 20, label: 'a' }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            deleteEntities: [1]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1100
        }))

        router.process()

        const visible = router.sampleInterpolated(100, 1125)
        expect(visible.status).toBe(InterpolationStatus.Ok)
        expect(visible.entities.map(entry => entry.entity.nid)).toEqual([1])
        expect(visible.entered.map(entry => entry.entity.nid)).toEqual([1])
        expect(router.tracked.has(1)).toBe(true)

        const exited = router.sampleInterpolated(100, 1180)
        expect(exited.status).toBe(InterpolationStatus.Ok)
        expect(exited.entities).toEqual([])
        expect(exited.exited.map(entry => entry.nid)).toEqual([1])
        expect(router.tracked.has(1)).toBe(false)
    })

    it('samples interpolated tracked entities while raw store remains authoritative', () => {
        const client = createClient()
        const router = new ClientFrameRouter(client, { defaultMode: ClientEntityMode.Interpolated })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            createEntities: [
                { nid: 1, ntype: 1, x: 0, y: 0, label: 'a' },
                { nid: 2, ntype: 1, x: 100, y: 100, label: 'b' }
            ]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [
                { nid: 1, prop: 'x', value: 10 },
                { nid: 2, prop: 'x', value: 200 }
            ]
        }))

        router.process()

        expect(router.getRaw(1)!.x).toBe(10)
        expect(router.getChangedNids()).toEqual([1, 2])

        const sample = router.sampleInterpolated(25, 1125)
        expect(sample.status).toBe(InterpolationStatus.Ok)
        const entity1 = sample.entities.find(entry => entry.entity.nid === 1)!.entity
        const entity2 = sample.entities.find(entry => entry.entity.nid === 2)!.entity

        expect(entity1.x).toBe(5)
        expect(entity2.x).toBe(150)
    })

    it('passes interpolator options to the default interpolator', () => {
        const client = createClient()
        const router = new ClientFrameRouter(client, {
            interpolatorOptions: {
                delay: {
                    mode: 'adaptive',
                    minMs: 25
                }
            }
        })

        expect(router.interpolator.options.mode).toBe('adaptive')
        expect(router.interpolator.options.minMs).toBe(25)
    })

    it('exposes the latest confirmed client tick for prediction reconciliation', () => {
        const client = createClient()
        const router = new ClientFrameRouter(client)

        expect(router.getLastConfirmedClientTick()).toBe(-1)

        applySnapshot(client, snapshot({
            timestamp: 1000,
            confirmedClientTick: 42
        }))
        router.process()

        expect(router.getLastConfirmedClientTick()).toBe(42)
    })

    it('lets userland keep local objects on tracked records', () => {
        const client = createClient()
        const router = new ClientFrameRouter(client)
        const local = { spriteId: 'sprite-1' }

        router.onCreate(1, entity => {
            router.trackEntity(entity, {
                mode: ClientEntityMode.Interpolated,
                local
            })
        })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        }))

        router.process()
        const sample = router.sampleInterpolated<typeof local>(25, 1125)

        expect(sample.status).toBe(InterpolationStatus.Ok)
        expect(sample.entities[0].tracked.local).toBe(local)
    })

    it('excludes predicted entities from interpolation while raw state remains readable', () => {
        const client = createClient()
        const router = new ClientFrameRouter(client, { defaultMode: ClientEntityMode.Interpolated })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            createEntities: [
                { nid: 1, ntype: 1, x: 0, y: 0, label: 'controlled' },
                { nid: 2, ntype: 1, x: 100, y: 100, label: 'remote' }
            ]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [
                { nid: 1, prop: 'x', value: 10 },
                { nid: 2, prop: 'x', value: 200 }
            ]
        }))

        router.process()
        router.setMode(1, ClientEntityMode.Predicted)

        const sample = router.sampleInterpolated(25, 1125)

        expect(sample.status).toBe(InterpolationStatus.Ok)
        expect(sample.entities.map(entry => entry.entity.nid)).toEqual([2])
        expect(router.getRaw(1)!.x).toBe(10)
    })
})
