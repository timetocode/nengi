import { Binary } from '../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client } from './Client'
import { ClientEntityMode, ReplicaRouter } from './ReplicaRouter'
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

describe('ReplicaRouter', () => {
    it('supports the ReplicaRouter and AdaptiveInterpolator public names', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, {
            interpolator: new AdaptiveInterpolator(client, {
                minDelayMs: 25
            })
        })

        expect(router).toBeInstanceOf(ReplicaRouter)
        expect(router.interpolator.options.mode).toBe('adaptive')
        expect(router.interpolator.options.minMs).toBe(25)
    })

    it('routes raw frame lifecycle and exposes changed ids', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Raw })
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

    it('routes creates by channel header when subscribed state arrives from a scoped channel', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Raw })
        const routed: string[] = []

        router.channel(ctx => ctx.header?.label === 'container:99')
            .onCreate(1, (entity, tracked, ctx) => {
                routed.push(`${entity.nid}:${tracked?.mode}:${ctx.channelId}:${ctx.header?.label}`)
            })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelHeaderCreates: [
                {
                    channelId: 10,
                    version: 1,
                    header: { nid: 20, ntype: 1, x: 0, y: 0, label: 'container:99' }
                },
                {
                    channelId: 11,
                    version: 1,
                    header: { nid: 21, ntype: 1, x: 0, y: 0, label: 'world' }
                }
            ],
            channelEntityCreates: [
                { nid: 1, channelId: 10 },
                { nid: 2, channelId: 11 }
            ],
            createEntities: [
                { nid: 1, ntype: 1, x: 0, y: 0, label: 'item' },
                { nid: 2, ntype: 1, x: 10, y: 10, label: 'world' }
            ]
        }))

        router.process()

        expect(routed).toEqual(['1:raw:10:container:99'])
        expect(router.getChannelId(1)).toBe(10)
        expect(router.getChannelHeader(1)?.label).toBe('container:99')
        expect(router.getChannelHeader(10)?.label).toBe('container:99')
    })

    it('fires global and channel-scoped CRUD handlers when both are registered', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Raw })
        const events: string[] = []

        router.onCreate(1, entity => events.push(`global:${entity.nid}`))
        router.channel(ctx => ctx.header?.label === 'inventory')
            .onCreate(1, (entity, tracked, ctx) => events.push(`channel:${ctx.channelId}:${entity.nid}`))

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelHeaderCreates: [
                {
                    channelId: 10,
                    version: 1,
                    header: { nid: 20, ntype: 1, x: 0, y: 0, label: 'inventory' }
                }
            ],
            channelEntityCreates: [
                { nid: 1, channelId: 10 }
            ],
            createEntities: [
                { nid: 1, ntype: 1, x: 0, y: 0, label: 'item' }
            ]
        }))

        router.process()

        expect(events).toEqual(['global:1', 'channel:10:1'])
        expect(router.getRaw(1)).toEqual({ nid: 1, ntype: 1, x: 0, y: 0, label: 'item' })
    })

    it('routes channel headers before channel entity creates', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Raw })
        const events: string[] = []

        router.onChannelHeaderCreate((header, frame, channelId) => {
            events.push(`header:${channelId}:${header.label}`)
        })
        router.channel(ctx => ctx.header?.label === 'inventory')
            .onCreate(1, (entity, tracked, ctx) => {
                events.push(`item:${ctx.channelId}:${ctx.header?.label}:${entity.label}`)
            })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelHeaderCreates: [
                {
                    channelId: 10,
                    version: 1,
                    header: { nid: 20, ntype: 1, x: 0, y: 0, label: 'inventory' }
                }
            ],
            channelEntityCreates: [
                { nid: 1, channelId: 10 }
            ],
            createEntities: [
                { nid: 1, ntype: 1, x: 0, y: 0, label: 'item' }
            ]
        }))

        router.process()

        expect(events).toEqual(['header:10:inventory', 'item:10:inventory:item'])
        expect(router.getChannelHeader(10)).toEqual({ nid: 20, ntype: 1, x: 0, y: 0, label: 'inventory' })
        expect(router.getChannelHeader(1)).toEqual({ nid: 20, ntype: 1, x: 0, y: 0, label: 'inventory' })
    })

    it('routes channel-scoped updates and deletes', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Raw })
        const events: string[] = []

        router.channel(ctx => ctx.header?.label === 'inventory')
            .onUpdate(1, (update, entity, tracked, ctx) => {
                events.push(`update:${ctx.channelId}:${update.nid}:${update.prop}:${entity?.[update.prop]}`)
            })
            .onDelete(1, (nid, deleted, tracked, ctx) => {
                events.push(`delete:${ctx.channelId}:${nid}:${deleted.entity?.label}`)
            })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelHeaderCreates: [
                {
                    channelId: 10,
                    version: 1,
                    header: { nid: 20, ntype: 1, x: 0, y: 0, label: 'inventory' }
                }
            ],
            channelEntityCreates: [
                { nid: 1, channelId: 10 }
            ],
            createEntities: [
                { nid: 1, ntype: 1, x: 0, y: 0, label: 'item' }
            ]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [
                { nid: 1, prop: 'x', value: 5 }
            ]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1100,
            deleteEntities: [1]
        }))

        router.process()

        expect(events).toEqual([
            'update:10:1:x:5',
            'delete:10:1:item'
        ])
    })

    it('closes a headered channel as a scope without per-entity delete handlers', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Raw })
        const events: string[] = []

        router.onDelete(1, nid => events.push(`delete:${nid}`))
        router.channel(ctx => ctx.header?.label === 'inventory')
            .onCreate(1, entity => router.trackEntity(entity, { mode: ClientEntityMode.Raw }))
            .onClose(ctx => events.push(`close:${ctx.channelId}:${ctx.header?.label}:${ctx.closed?.entityNids.join(',')}`))

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelHeaderCreates: [
                {
                    channelId: 10,
                    version: 1,
                    header: { nid: 20, ntype: 1, x: 0, y: 0, label: 'inventory' }
                }
            ],
            channelEntityCreates: [
                { nid: 1, channelId: 10 }
            ],
            createEntities: [
                { nid: 1, ntype: 1, x: 0, y: 0, label: 'item' }
            ]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            channelHeaderDeletes: [
                { channelId: 10 }
            ]
        }))

        const batch = router.process()

        expect(events).toEqual(['close:10:inventory:1'])
        expect(batch.deleteEntities).toEqual([])
        expect(batch.closedChannels).toEqual([
            {
                channelId: 10,
                header: { nid: 20, ntype: 1, x: 0, y: 0, label: 'inventory' },
                entityNids: [1]
            }
        ])
        expect(router.getRaw(1)).toBeUndefined()
        expect(router.tracked.has(1)).toBe(false)
    })

    it('routes ECS root lifecycle separately from component entity lifecycle', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Raw })
        const events: string[] = []

        router.onEcsCreateEntity(pid => events.push(`ecs-create:${pid}`))
        router.onEcsCreateComponent(component => events.push(`ecs-component:${component.nid}:${(component as any).pid}`))
        router.onCreate(1, entity => events.push(`create:${entity.nid}`))
        router.onEcsDeleteEntity(pid => events.push(`ecs-delete:${pid}`))
        router.onDelete(1, nid => events.push(`delete:${nid}`))

        applySnapshot(client, snapshot({
            timestamp: 1000,
            ecsCreateEntities: [100],
            ecsCreateComponents: [{ nid: 1, ntype: 1, pid: 100, x: 0, y: 0, label: 'transform' } as any]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            ecsDeleteEntities: [100],
            deleteEntities: [1]
        }))

        const batch = router.process()

        expect(events).toEqual([
            'ecs-create:100',
            'ecs-component:1:100',
            'create:1',
            'ecs-delete:100',
            'delete:1'
        ])
        expect(batch.ecsCreateEntities).toEqual([100])
        expect(batch.ecsCreateComponents.map(component => component.nid)).toEqual([1])
        expect(batch.ecsDeleteEntities).toEqual([100])
    })

    it('applies and routes queued frames in deterministic chunks', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Raw })
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

    it('prunes client decode metadata after entity deletes are applied', () => {
        const client = createClient()

        applySnapshot(client, snapshot({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        }))
        client.network.processNextFrame()

        client.network.entityNTypes.set(1, 1)

        applySnapshot(client, snapshot({
            timestamp: 1050,
            deleteEntities: [1]
        }))
        client.network.processNextFrame()

        expect(client.network.entityNTypes.has(1)).toBe(false)
    })

    it('keeps interpolated entities tracked after raw delete until render-time exit', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Interpolated })

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
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Interpolated })

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

    it('routes interpolated messages when the interpolation timeline reaches their frame', () => {
        const client = createClient()
        const router = new ReplicaRouter(client)
        const immediate: number[] = []
        const interpolated: number[] = []

        router.onMessage(2, message => immediate.push(message.nid))
        router.onInterpolatedMessage(2, message => interpolated.push(message.nid))

        applySnapshot(client, snapshot({
            timestamp: 1000,
            messages: [{ ntype: 2, nid: 1 }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            messages: [{ ntype: 2, nid: 2 }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1100,
            messages: [{ ntype: 2, nid: 3 }]
        }))

        router.process()

        expect(immediate).toEqual([1, 2, 3])
        const firstSample = router.sampleInterpolated(25, 1125)
        expect(firstSample.messages.map(message => message.nid)).toEqual([1, 2])
        expect(interpolated).toEqual([1, 2])

        const secondSample = router.sampleInterpolated(25, 1175)
        expect(secondSample.messages.map(message => message.nid)).toEqual([3])
        expect(interpolated).toEqual([1, 2, 3])

        const thirdSample = router.sampleInterpolated(25, 1175)
        expect(thirdSample.messages).toEqual([])
        expect(interpolated).toEqual([1, 2, 3])
    })

    it('passes interpolator options to the default interpolator', () => {
        const client = createClient()
        const router = new ReplicaRouter(client, {
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
        const router = new ReplicaRouter(client)

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
        const router = new ReplicaRouter(client)
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
        const router = new ReplicaRouter(client, { defaultMode: ClientEntityMode.Interpolated })

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
