import { Buffer } from 'buffer'
import createSnapshotBufferRefactor, {
    collectSnapshotPlan,
    commitSnapshotPlan,
    countSnapshotBytes,
    writeSnapshot
} from './createSnapshotBufferRefactor'
import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ResponseStatus } from '../../common/Endpoint'
import { ClientNetwork } from '../../client/ClientNetwork'
import { Channel } from '../../server/Channel'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { TestBufferWriter, testBinaryAdapter } from '../../testSupport/BufferBinary'
import { createEndpointPayload } from '../endpoint/EndpointPayload'

enum NType {
    Entity = 1,
    Message = 2
}

function createContext() {
    const context = new Context()
    context.register(NType.Entity, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        label: Binary.String
    }))
    context.register(NType.Message, defineMessageSchema({
        text: Binary.String
    }))
    return context
}

function createUser(instance: Instance) {
    const user = new User(undefined, {
        binary: testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    } as any)
    user.id = 1
    user.instance = instance
    return user
}

function createClientNetwork(context: Context) {
    const client = {
        context,
        serverTickRate: 20,
        disconnectHandler: jest.fn(),
        websocketErrorHandler: jest.fn(),
        predictor: {
            getErrors: jest.fn(() => ({ entities: new Map() })),
            cleanUp: jest.fn()
        },
        network: undefined as unknown as ClientNetwork
    }
    const network = new ClientNetwork(client as any)
    client.network = network
    return network
}

describe('server snapshot pipeline', () => {
    it('collects visible create, update, delete, queued message, and response state', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)
        channel.subscribe(user)

        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'switch'
        })
        const nid = entity.nid
        const message = { ntype: NType.Message, text: 'hello' }
        user.queueMessage(message)
        user.responseQueue.push({ requestId: 77, status: ResponseStatus.Ok, payload: createEndpointPayload({ ok: true }) })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        const first = collectSnapshotPlan(user, instance)

        expect(first.createEntities).toEqual([entity])
        expect(first.updateEntities).toEqual([])
        expect(first.deleteEntities).toEqual([])
        expect(first.messages).toEqual([message])
        expect(first.responses).toEqual([{ requestId: 77, status: ResponseStatus.Ok, payload: createEndpointPayload({ ok: true }) }])
        expect(user.messageQueue).toEqual([])
        expect(user.responseQueue).toEqual([{ requestId: 77, status: ResponseStatus.Ok, payload: createEndpointPayload({ ok: true }) }])

        entity.x = 9
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        const second = collectSnapshotPlan(user, instance)

        expect(second.createEntities).toEqual([])
        expect(second.updateEntities).toEqual([
            expect.objectContaining({ nid, prop: 'x', value: 9 })
        ])
        expect(second.deleteEntities).toEqual([])

        channel.unsubscribe(user)
        instance.tick = 3
        instance.cache.createCachesForTick(instance.tick)
        const third = collectSnapshotPlan(user, instance)

        expect(third.createEntities).toEqual([])
        expect(third.updateEntities).toEqual([])
        expect(third.deleteEntities).toEqual([nid])
    })

    it('counts and writes a collected snapshot plan', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)

        channel.subscribe(user)
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })
        user.queueMessage({ ntype: NType.Message, text: 'created' })
        user.responseQueue.push({ requestId: 77, status: ResponseStatus.Ok, payload: createEndpointPayload({ ok: true }) })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        const plan = collectSnapshotPlan(user, instance)
        const byteLength = countSnapshotBytes(plan, context)
        const writer = TestBufferWriter.create(byteLength)

        writeSnapshot(plan, context, writer)

        expect(writer.offset).toBe(byteLength)
        expect(user.responseQueue).toHaveLength(1)

        user.responseQueue.push({ requestId: 78, status: ResponseStatus.Ok, payload: createEndpointPayload({ late: true }) })
        commitSnapshotPlan(user, plan)

        expect(user.responseQueue).toEqual([{ requestId: 78, status: ResponseStatus.Ok, payload: createEndpointPayload({ late: true }) }])
    })

    it('collects at most 255 queued responses per user frame', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)

        for (let i = 1; i <= 256; i++) {
            user.responseQueue.push({
                requestId: i,
                status: ResponseStatus.Ok,
                payload: createEndpointPayload({ i })
            })
        }

        const first = collectSnapshotPlan(user, instance)
        expect(first.responses).toHaveLength(255)
        expect(first.responses[0].requestId).toBe(1)
        expect(first.responses[254].requestId).toBe(255)

        commitSnapshotPlan(user, first)
        expect(user.responseQueue).toHaveLength(1)
        expect(user.responseQueue[0].requestId).toBe(256)

        const second = collectSnapshotPlan(user, instance)
        expect(second.responses).toHaveLength(1)
        expect(second.responses[0].requestId).toBe(256)
    })

    it('reports response backlog once after a capped user frame', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const onResponseBacklog = jest.fn()
        instance.tick = 7
        instance.network.onResponseBacklog = onResponseBacklog

        for (let i = 1; i <= 256; i++) {
            user.responseQueue.push({
                requestId: i,
                status: ResponseStatus.Ok,
                payload: createEndpointPayload({ i })
            })
        }

        createSnapshotBufferRefactor(user, instance)

        expect(user.responseQueue).toHaveLength(1)
        expect(onResponseBacklog).toHaveBeenCalledWith({
            user,
            queued: 256,
            sent: 255,
            remaining: 1,
            tick: 7
        })

        createSnapshotBufferRefactor(user, instance)

        expect(user.responseQueue).toHaveLength(0)
        expect(onResponseBacklog).toHaveBeenCalledTimes(1)
    })

    it('sends a protocol update before entity sections when nid width grows', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)
        const clientNetwork = createClientNetwork(context)

        channel.subscribe(user)
        for (let i = 0; i < 256; i++) {
            channel.addEntity({
                nid: 0,
                ntype: NType.Entity,
                x: i,
                y: i,
                label: `entity:${i}`
            })
        }

        expect(instance.localState.nidType).toBe(Binary.UInt16)

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        const buffer = createSnapshotBufferRefactor(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(buffer))

        expect(clientNetwork.protocol.nidType).toBe(Binary.UInt16)
        expect(clientNetwork.latestFrame?.createEntities).toHaveLength(256)
        expect(clientNetwork.store.get(257)).toEqual({
            nid: 257,
            ntype: NType.Entity,
            x: 255,
            y: 255,
            label: 'entity:255'
        })
    })

    it('creates snapshot buffers that the client can consume as raw frames', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)
        const clientNetwork = createClientNetwork(context)

        channel.subscribe(user)
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })
        const nid = entity.nid
        user.queueMessage({ ntype: NType.Message, text: 'created' })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        const createBuffer = createSnapshotBufferRefactor(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createBuffer))

        expect(clientNetwork.messages).toEqual([
            { ntype: NType.Message, text: 'created' }
        ])
        expect(clientNetwork.latestFrame?.createEntities).toEqual([
            { nid, ntype: NType.Entity, x: 5, y: 6, label: 'door' }
        ])
        expect(clientNetwork.store.get(nid)).toEqual({
            nid,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })

        entity.x = 11
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        const updateBuffer = createSnapshotBufferRefactor(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(updateBuffer))

        expect(clientNetwork.latestFrame?.createEntities).toEqual([])
        expect(clientNetwork.latestFrame?.updateEntities).toEqual([
            { nid, prop: 'x', previous: 5, value: 11 }
        ])
        expect(clientNetwork.store.get(nid)?.x).toBe(11)

        channel.removeEntity(entity)
        instance.tick = 3
        instance.cache.createCachesForTick(instance.tick)
        const deleteBuffer = createSnapshotBufferRefactor(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(deleteBuffer))

        expect(clientNetwork.latestFrame?.deleteEntities).toEqual([nid])
        expect(clientNetwork.store.entities.has(nid)).toBe(false)
        expect(clientNetwork.entityNTypes.has(nid)).toBe(false)
    })

    it('drains applied frames in receive order without duplicating authoritative state', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)
        const clientNetwork = createClientNetwork(context)

        channel.subscribe(user)
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'piece'
        })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBufferRefactor(user, instance) as Buffer))

        entity.x = 3
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBufferRefactor(user, instance) as Buffer))

        const frames = clientNetwork.drainFrames()

        expect(frames).toHaveLength(2)
        expect(frames[0].createEntities).toHaveLength(1)
        expect(frames[1].updateEntities).toEqual([
            { nid: entity.nid, prop: 'x', previous: 1, value: 3 }
        ])
        expect(clientNetwork.drainFrames()).toEqual([])
        expect(clientNetwork.store.get(entity.nid)?.x).toBe(3)
    })
})
