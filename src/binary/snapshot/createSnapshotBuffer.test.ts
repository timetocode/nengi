import { Buffer } from 'buffer'
import createSnapshotBuffer, {
    collectSnapshotPlan,
    commitSnapshotPlan,
    countSnapshotBytes,
    writeSnapshot
} from './createSnapshotBuffer'
import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ResponseStatus } from '../../common/Endpoint'
import { ClientNetwork } from '../../client/ClientNetwork'
import { AABB2D } from '../../server/AABB2D'
import { AABB3D } from '../../server/AABB3D'
import { SpatialChannel2D } from '../../server/SpatialChannel2D'
import { SpatialChannel3D } from '../../server/SpatialChannel3D'
import { SpatialGridChannel2D } from '../../server/SpatialGridChannel2D'
import { SpatialGridChannel3D } from '../../server/SpatialGridChannel3D'
import { Channel } from '../../server/Channel'
import { ManualChannel } from '../../server/ManualChannel'
import { ManualSpatialChannel2D } from '../../server/ManualSpatialChannel2D'
import { ManualSpatialChannel3D } from '../../server/ManualSpatialChannel3D'
import { EcsChannel } from '../../server/EcsChannel'
import { EcsSpatialChannel2D } from '../../server/EcsSpatialChannel2D'
import { EcsSpatialChannel3D } from '../../server/EcsSpatialChannel3D'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { TestBufferWriter, testBinaryAdapter } from '../../testSupport/BufferBinary'
import { createEndpointPayload } from '../endpoint/EndpointPayload'
import { BinaryDebugError } from '../BinaryDebugError'
import { createEmptySnapshotPlan } from './SnapshotPlan'

enum NType {
    Entity = 1,
    Message = 2,
    Transform = 3
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

function createGroupedContext() {
    const context = new Context()
    context.register(NType.Entity, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        label: Binary.String,
        $options: {
            updateGroups: {
                position: ['x', 'y']
            }
        }
    }))
    context.register(NType.Message, defineMessageSchema({
        text: Binary.String
    }))
    return context
}

function createGroupedContext3D() {
    const context = new Context()
    context.register(NType.Entity, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        z: Binary.Float64,
        label: Binary.String,
        $options: {
            updateGroups: {
                transform: ['x', 'y', 'z']
            }
        }
    }))
    context.register(NType.Message, defineMessageSchema({
        text: Binary.String
    }))
    return context
}

function createEcsContext() {
    const context = createContext()
    context.register(NType.Transform, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        $options: {
            updateGroups: {
                position: ['x', 'y']
            }
        }
    }))
    return context
}

function createEcsContext3D() {
    const context = createContext()
    context.register(NType.Transform, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        z: Binary.Float64,
        $options: {
            updateGroups: {
                position: ['x', 'y', 'z']
            }
        }
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

function lastSentBuffer(user: User) {
    const send = user.networkAdapter.send as jest.Mock
    return send.mock.calls[send.mock.calls.length - 1][1] as Buffer
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

    it('collects hierarchy creates and updates parent-first, then deletes child-first', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)
        channel.subscribe(user)

        const parent = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'parent'
        })
        const child = instance.localState.addChild(parent, {
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'child'
        })
        const parentNid = parent.nid
        const childNid = child.nid

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        const createPlan = collectSnapshotPlan(user, instance)

        expect(createPlan.createEntities.map(entity => entity.nid)).toEqual([parentNid, childNid])

        parent.x = 11
        child.x = 13
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        const updatePlan = collectSnapshotPlan(user, instance)

        expect(updatePlan.updateEntityGroups.map(update => update.nid)).toEqual([parentNid, childNid])

        channel.removeEntity(parent)
        instance.tick = 3
        instance.cache.createCachesForTick(instance.tick)
        const deletePlan = collectSnapshotPlan(user, instance)

        expect(deletePlan.deleteEntities).toEqual([childNid, parentNid])
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

    it('bundles grouped entity updates and expands them on the client', () => {
        const context = createGroupedContext()
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

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))
        clientNetwork.processNextFrame()

        entity.x = 11
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        const plan = collectSnapshotPlan(user, instance)

        expect(plan.updateEntities).toEqual([])
        expect(plan.updateEntityGroups).toHaveLength(1)
        expect(plan.updateEntityGroups[0].group.name).toBe('position')
        expect(plan.updateEntityGroups[0].values).toEqual([11, 6])

        const byteLength = countSnapshotBytes(plan, context)
        const writer = TestBufferWriter.create(byteLength)
        writeSnapshot(plan, context, writer)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(writer.buffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.updateEntities).toEqual([
            { nid, prop: 'x', previous: 5, value: 11 }
        ])
        expect(clientNetwork.store.get(nid)).toEqual({
            nid,
            ntype: NType.Entity,
            x: 11,
            y: 6,
            label: 'door'
        })
    })

    it('allows repeated update group sections in one snapshot', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)
        const clientNetwork = createClientNetwork(context)

        channel.subscribe(user)
        const first = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'first'
        })
        const second = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'second'
        })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))
        clientNetwork.processNextFrame()

        first.x = 11
        second.x = 13
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        const collected = collectSnapshotPlan(user, instance)
        const firstPlan = createEmptySnapshotPlan()
        const secondPlan = createEmptySnapshotPlan()
        firstPlan.updateEntityGroups = [collected.updateEntityGroups[0]]
        secondPlan.updateEntityGroups = [collected.updateEntityGroups[1]]

        const byteLength = countSnapshotBytes(firstPlan, context) + countSnapshotBytes(secondPlan, context)
        const writer = TestBufferWriter.create(byteLength)
        writeSnapshot(firstPlan, context, writer)
        writeSnapshot(secondPlan, context, writer)

        clientNetwork.readSnapshot(testBinaryAdapter.createReader(writer.buffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(first.nid)?.x).toBe(11)
        expect(clientNetwork.store.get(second.nid)?.x).toBe(13)
    })

    it('can use shared update fragments for steady-state all-visible channels', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new Channel(instance.localState)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser)
        channel.subscribe(secondUser)
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })
        const child = instance.localState.addChild(entity, {
            nid: 0,
            ntype: NType.Entity,
            x: 15,
            y: 16,
            label: 'hinge'
        })
        const nid = entity.nid
        const childNid = child.nid

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        entity.x = 11
        child.x = 21
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(instance.network.sharedUpdateFragments.size).toBe(1)
        expect(firstClient.store.get(nid)?.x).toBe(11)
        expect(firstClient.store.get(childNid)?.x).toBe(21)
        expect(secondClient.store.get(nid)?.x).toBe(11)
        expect(secondClient.store.get(childNid)?.x).toBe(21)
    })

    it('writes manual grouped mutations directly', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel(instance.localState)
        const Entity = channel.type(NType.Entity, context.getSchema(NType.Entity)!)
        const position = Entity.position

        instance.users.set(user.id, user)
        channel.subscribe(user)
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        entity.x = 11
        entity.y = 12
        position(entity, 11, 12)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.x).toBe(11)
        expect(clientNetwork.store.get(entity.nid)?.y).toBe(12)
        expect(clientNetwork.latestFrame?.updateEntities.map(update => update.prop)).toEqual(['x', 'y'])
    })

    it('writes manual prop mutations directly', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel(instance.localState)
        const Entity = channel.type(NType.Entity, context.getSchema(NType.Entity)!)
        const label = Entity.label

        instance.users.set(user.id, user)
        channel.subscribe(user)
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        entity.label = 'gate'
        label(entity, 'gate')
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('gate')
        expect(clientNetwork.latestFrame?.updateEntities.map(update => update.prop)).toEqual(['label'])
    })

    it('writes manual spatial grouped mutations through cell fragments', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualSpatialChannel2D(instance.localState, 100)
        const Entity = channel.type(NType.Entity, context.getSchema(NType.Entity)!)
        const position = Entity.position

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(50, 50, 60, 60))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        entity.x = 11
        entity.y = 12
        position(entity, 11, 12)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.x).toBe(11)
        expect(clientNetwork.store.get(entity.nid)?.y).toBe(12)
        expect(instance.network.sharedUpdateFragments.size).toBe(1)
    })

    it('writes manual spatial 3D grouped mutations through cell fragments', () => {
        const context = createGroupedContext3D()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualSpatialChannel3D(instance.localState, 100)
        const Entity = channel.type(NType.Entity, context.getSchema(NType.Entity)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB3D(50, 50, 50, 60, 60, 60))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'door-3d'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('door-3d')

        entity.x = 11
        entity.y = 12
        entity.z = 13
        Entity.transform(entity, 11, 12, 13)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.x).toBe(11)
        expect(clientNetwork.store.get(entity.nid)?.y).toBe(12)
        expect(clientNetwork.store.get(entity.nid)?.z).toBe(13)

        entity.z = 250
        Entity.transform(entity, 11, 12, 250)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
    })

    it('writes manual spatial grouped child mutations through the parent cell fragment', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualSpatialChannel2D(instance.localState, 100)
        const Entity = channel.type(NType.Entity, context.getSchema(NType.Entity)!)
        const position = Entity.position

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(50, 50, 60, 60))
        const parent = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'parent'
        })
        const child = instance.attachChild(parent, {
            nid: 0,
            ntype: NType.Entity,
            x: 15,
            y: 16,
            label: 'child'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        child.x = 21
        child.y = 22
        position(child, 21, 22)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(child.nid)?.x).toBe(21)
        expect(clientNetwork.store.get(child.nid)?.y).toBe(22)
        expect(instance.network.sharedUpdateFragments.size).toBe(1)
    })

    it('replicates ECS roots as ids and components as pid-owned state', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel(instance.localState)
        const Transform = channel.type(NType.Transform, context.getSchema(NType.Transform)!)

        instance.users.set(user.id, user)
        channel.subscribe(user)
        const pid = channel.createEntity()
        const transform = channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 1,
            y: 2
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true)
        expect(clientNetwork.latestFrame?.ecsCreateEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
        expect(clientNetwork.store.get(transform.nid)).toEqual({
            nid: transform.nid,
            ntype: NType.Transform,
            pid,
            x: 1,
            y: 2
        })

        transform.x = 5
        transform.y = 6
        Transform.position(transform, 5, 6)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(transform.nid)?.x).toBe(5)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(6)

        const componentNid = transform.nid
        channel.removeEntity(pid)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.previousSnapshot?.deleteEntities).toEqual([])
        expect(clientNetwork.latestFrame?.ecsDeleteEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.deleteEntities).toEqual([componentNid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(componentNid)).toBe(false)
    })

    it('can compose ECS and regular channels in one user snapshot', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const ecsChannel = new EcsChannel(instance.localState)
        const regularChannel = new Channel(instance.localState)
        const Transform = ecsChannel.type(NType.Transform, context.getSchema(NType.Transform)!)

        instance.users.set(user.id, user)
        ecsChannel.subscribe(user)
        regularChannel.subscribe(user)

        const pid = ecsChannel.createEntity()
        const transform = ecsChannel.addComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 1,
            y: 2
        })
        const regular = regularChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'regular'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.ecsCreateEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
        expect(clientNetwork.latestFrame?.createEntities.map(entity => entity.nid)).toEqual([transform.nid, regular.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true)
        expect(clientNetwork.store.get(transform.nid)?.x).toBe(1)
        expect(clientNetwork.store.get(regular.nid)?.label).toBe('regular')

        transform.x = 5
        transform.y = 6
        Transform.position(transform, 5, 6)
        regular.x = 7

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(transform.nid)?.x).toBe(5)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(6)
        expect(clientNetwork.store.get(regular.nid)?.x).toBe(7)

        const transformNid = transform.nid
        const regularNid = regular.nid
        ecsChannel.removeEntity(pid)
        regularChannel.removeEntity(regular)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.previousSnapshot?.deleteEntities).toEqual([regularNid])
        expect(clientNetwork.latestFrame?.ecsDeleteEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.deleteEntities).toHaveLength(2)
        expect(clientNetwork.latestFrame?.deleteEntities).toEqual(expect.arrayContaining([transformNid, regularNid]))
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(transformNid)).toBe(false)
        expect(clientNetwork.store.entities.has(regularNid)).toBe(false)
    })

    it('spatially replicates ECS roots from component state', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsSpatialChannel2D(instance.localState, 10)
        const Transform = channel.type(NType.Transform, context.getSchema(NType.Transform)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(5, 5, 10, 10))

        const pid = channel.createEntity()
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 5
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.ecsCreateEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true)
        expect(clientNetwork.store.get(transform.nid)?.x).toBe(5)

        transform.x = 6
        transform.y = 7
        Transform.position(transform, 6, 7)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(transform.nid)?.x).toBe(6)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(7)

        transform.x = 50
        transform.y = 50
        Transform.position(transform, 50, 50)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.previousSnapshot?.deleteEntities).toEqual([])
        expect(clientNetwork.latestFrame?.ecsDeleteEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.deleteEntities).toEqual([transform.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false)
    })

    it('spatially replicates ECS roots from 3D component state', () => {
        const context = createEcsContext3D()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsSpatialChannel3D(instance.localState, 10)
        const Transform = channel.type(NType.Transform, context.getSchema(NType.Transform)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB3D(5, 5, 5, 10, 10, 10))

        const pid = channel.createEntity()
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 5,
            z: 5
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.ecsCreateEntities).toEqual([pid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true)
        expect(clientNetwork.store.get(transform.nid)?.z).toBe(5)

        transform.x = 6
        transform.y = 7
        transform.z = 8
        Transform.position(transform, 6, 7, 8)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(transform.nid)?.x).toBe(6)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(7)
        expect(clientNetwork.store.get(transform.nid)?.z).toBe(8)

        transform.z = 50
        Transform.position(transform, 6, 7, 50)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.ecsDeleteEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.deleteEntities).toEqual([transform.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false)
    })

    it('spatially replicates ECS roots on the xz plane without copying z into y', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsSpatialChannel2D(instance.localState, 10, { plane: 'xz' })
        const Transform = channel.type(NType.Transform, context.getSchema(NType.Transform)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, { x: 5, z: 5, halfX: 10, halfZ: 10 })

        const pid = channel.createEntity()
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 500,
            z: 5
        } as any)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.ecsCreateEntities).toEqual([pid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(500)

        transform.x = 6
        transform.y = 501
        transform.z = 50
        Transform.position(transform, 6, 501)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.ecsDeleteEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.deleteEntities).toEqual([transform.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false)
    })

    it('updates manual spatial visibility when movement changes occupied cells', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualSpatialChannel2D(instance.localState, 100)
        const Entity = channel.type(NType.Entity, context.getSchema(NType.Entity)!)
        const position = Entity.position

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(100, 50, 110, 60))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'moving'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        entity.x = 150
        entity.y = 6
        position(entity, 150, 6)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.x).toBe(150)
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(true)
    })

    it('updates manual spatial visibility on the xz plane without treating y as horizontal', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualSpatialChannel2D(instance.localState, 100, { plane: 'xz' })
        const Entity = channel.type(NType.Entity, context.getSchema(NType.Entity)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, { x: 50, z: 50, halfX: 60, halfZ: 60 })
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 500,
            z: 5,
            label: 'xz-mover'
        } as any)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('xz-mover')
        expect(clientNetwork.store.get(entity.nid)?.y).toBe(500)

        entity.x = 250
        entity.y = 501
        entity.z = 5
        Entity.position(entity, 250, 501)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
    })

    it('creates and deletes manual spatial movers per user-visible cell set', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new ManualSpatialChannel2D(instance.localState, 100)
        const Entity = channel.type(NType.Entity, context.getSchema(NType.Entity)!)
        const position = Entity.position

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser, new AABB2D(50, 50, 40, 40))
        channel.subscribe(secondUser, new AABB2D(150, 50, 40, 40))
        const mover = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'mover'
        })
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 150,
            y: 6,
            label: 'anchor'
        })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        const moverNid = mover.nid
        mover.x = 150
        mover.y = 6
        position(mover, 150, 6)
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(firstClient.latestFrame?.deleteEntities).toEqual([moverNid])
        expect(firstClient.store.entities.has(moverNid)).toBe(false)
        expect(secondClient.latestFrame?.createEntities.map(entity => entity.nid)).toContain(moverNid)
        expect(secondClient.store.get(moverNid)?.x).toBe(150)
    })

    it('can use shared create and delete fragments for synchronized all-visible channel deltas', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        instance.network.snapshotPerformanceEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new Channel(instance.localState)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser)
        channel.subscribe(secondUser)
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'initial'
        })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        const crate = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'crate'
        })
        const item = instance.attachChild(crate, {
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'item'
        })
        const crateNid = crate.nid
        const itemNid = item.nid

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(instance.network.sharedCreateFragments.size).toBe(1)
        expect(firstClient.latestFrame?.createEntities.map(entity => entity.nid)).toEqual([crateNid, itemNid])
        expect(secondClient.latestFrame?.createEntities.map(entity => entity.nid)).toEqual([crateNid, itemNid])
        expect(firstClient.store.get(itemNid)?.label).toBe('item')
        expect(secondClient.store.get(itemNid)?.label).toBe('item')

        channel.removeEntity(crate)
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(instance.network.sharedDeleteFragments.size).toBe(1)
        expect(firstClient.latestFrame?.deleteEntities).toEqual([itemNid, crateNid])
        expect(secondClient.latestFrame?.deleteEntities).toEqual([itemNid, crateNid])
        expect(firstClient.store.entities.has(crateNid)).toBe(false)
        expect(secondClient.store.entities.has(itemNid)).toBe(false)
        expect(instance.network.snapshotPerformance.sharedFragmentBuilds).toBe(4)
        expect(instance.network.snapshotPerformance.sharedFragmentHits).toBe(4)
    })

    it('keeps new all-visible channel subscribers on the full baseline create path', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const existingUser = createUser(instance)
        const newUser = createUser(instance)
        newUser.id = 2
        const existingClient = createClientNetwork(context)
        const newClient = createClientNetwork(context)
        const channel = new Channel(instance.localState)

        instance.users.set(existingUser.id, existingUser)
        channel.subscribe(existingUser)
        const initial = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'initial'
        })

        instance.step()
        existingClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(existingUser)))
        existingClient.processNextFrame()

        instance.users.set(newUser.id, newUser)
        channel.subscribe(newUser)
        const added = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'added'
        })

        instance.step()
        existingClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(existingUser)))
        existingClient.processNextFrame()
        newClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(newUser)))
        newClient.processNextFrame()

        expect(instance.network.sharedCreateFragments.size).toBe(1)
        expect(existingClient.latestFrame?.createEntities.map(entity => entity.nid)).toEqual([added.nid])
        expect(newClient.latestFrame?.createEntities.map(entity => entity.nid)).toEqual([initial.nid, added.nid])
    })

    it('does not emit shared create or delete fragments for same-tick transient roots', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel(instance.localState)

        instance.users.set(user.id, user)
        channel.subscribe(user)
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'initial'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const transient = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'transient'
        })
        channel.removeEntity(transient)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(instance.network.sharedCreateFragments.size).toBe(0)
        expect(instance.network.sharedDeleteFragments.size).toBe(0)
        expect(clientNetwork.latestFrame?.createEntities).toEqual([])
        expect(clientNetwork.latestFrame?.deleteEntities).toEqual([])
    })

    it('can use shared message fragments for channel broadcasts', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.snapshotPerformanceEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new Channel(instance.localState)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser)
        channel.subscribe(secondUser)
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })
        channel.addMessage({ ntype: NType.Message, text: 'broadcast' })
        firstUser.queueMessage({ ntype: NType.Message, text: 'private' })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(firstClient.messages).toEqual([
            { ntype: NType.Message, text: 'private' },
            { ntype: NType.Message, text: 'broadcast' }
        ])
        expect(secondClient.messages).toEqual([
            { ntype: NType.Message, text: 'broadcast' }
        ])
        expect(channel.broadcastMessages).toEqual([])
        expect(instance.network.snapshotPerformance.sharedMessageFragmentBuilds).toBe(1)
        expect(instance.network.snapshotPerformance.sharedMessageFragmentHits).toBe(1)
        expect(instance.network.snapshotPerformance.messagesTotal).toBe(3)
    })

    it('can use reusable cell update fragments without userland updateEntity calls', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser, new AABB2D(10, 10, 5, 5))
        channel.subscribe(secondUser, new AABB2D(10, 10, 5, 5))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        entity.x = 11
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(instance.network.sharedUpdateFragments.size).toBe(1)
        expect(firstClient.store.get(entity.nid)?.x).toBe(11)
        expect(secondClient.store.get(entity.nid)?.x).toBe(11)
    })

    it('uses the xz plane for SpatialChannel2D visibility without copying z into y', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50, { plane: 'xz' })

        instance.users.set(user.id, user)
        channel.subscribe(user, { x: 10, z: 10, halfX: 20, halfZ: 20 })
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 500,
            z: 6,
            label: 'xz-visible'
        } as any)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('xz-visible')
        expect(clientNetwork.store.get(entity.nid)?.y).toBe(500)

        entity.z = 200
        channel.updateEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
    })

    it('uses true 3D cells for SpatialChannel3D visibility', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel3D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB3D(10, 10, 10, 20, 20, 20))
        const visible = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'visible-3d'
        })
        const above = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 200,
            z: 7,
            label: 'above'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(visible.nid)?.label).toBe('visible-3d')
        expect(clientNetwork.store.entities.has(above.nid)).toBe(false)
    })

    it('uses coarse circle cells for SpatialChannel2D visibility', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, { x: 0, y: 0, radius: 25 })
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 10,
            y: 0,
            label: 'circle-visible'
        } as any)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('circle-visible')
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0'])

        entity.x = 80
        channel.updateEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
        expect(channel.getVisibleCellKeys(user.id)).toEqual([])
    })

    it('uses coarse sphere cells for SpatialChannel3D visibility', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel3D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, { x: 0, y: 0, z: 0, radius: 25 })
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 10,
            y: 0,
            z: 0,
            label: 'sphere-visible'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('sphere-visible')
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0:0'])

        entity.x = 80
        channel.updateEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
        expect(channel.getVisibleCellKeys(user.id)).toEqual([])
    })

    it('uses grid-backed 2D cells for SpatialGridChannel2D visibility', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialGridChannel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(10, 10, 20, 20))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'grid-visible'
        } as any)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('grid-visible')

        entity.x = 200
        channel.updateEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
    })

    it('updates SpatialChannel3D visibility when only vertical position changes cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel3D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB3D(10, 10, 10, 20, 20, 20))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'vertical'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(true)
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0:0'])

        entity.y = 200
        channel.updateEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
        expect(channel.getVisibleCellKeys(user.id)).toEqual([])
    })

    it('uses grid-backed true 3D cells for SpatialGridChannel3D visibility', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialGridChannel3D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB3D(10, 10, 10, 20, 20, 20))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'grid-3d'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(true)
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0:0'])

        entity.y = 200
        channel.updateEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
        expect(channel.getVisibleCellKeys(user.id)).toEqual([])
    })

    it('spatially culls SpatialChannel3D messages vertically', () => {
        const context = createContext()
        const instance = new Instance(context)
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new SpatialChannel3D(instance.localState, 50)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser, new AABB3D(10, 10, 10, 20, 20, 20))
        channel.subscribe(secondUser, new AABB3D(10, 200, 10, 20, 20, 20))
        channel.addMessage({ ntype: NType.Message, text: 'near-3d', x: 10, y: 10, z: 10 })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(firstClient.messages).toEqual([{ ntype: NType.Message, text: 'near-3d' }])
        expect(secondClient.messages).toEqual([])
    })

    it('records explicit dirty hints without requiring them for implicit SpatialChannel2D updates', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(10, 10, 5, 5))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        entity.x = 11
        expect(instance.markDirty(entity)).toBe(true)
        expect(instance.localState.dirtyNids.has(entity.nid)).toBe(true)
        expect(channel.getDirtyCellKeys()).toEqual(['0:0'])

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.x).toBe(11)
        expect(instance.localState.dirtyNids.size).toBe(0)
        expect(channel.getDirtyCellKeys()).toEqual([])
    })

    it('can reuse cell create and delete fragments when users enter and leave the same cell', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser, new AABB2D(200, 200, 5, 5))
        channel.subscribe(secondUser, new AABB2D(200, 200, 5, 5))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        channel.updateView(firstUser, new AABB2D(10, 10, 5, 5))
        channel.updateView(secondUser, new AABB2D(10, 10, 5, 5))
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(instance.network.sharedCreateFragments.size).toBe(1)
        expect(firstClient.store.get(entity.nid)?.label).toBe('door')
        expect(secondClient.store.get(entity.nid)?.label).toBe('door')

        channel.updateView(firstUser, new AABB2D(200, 200, 5, 5))
        channel.updateView(secondUser, new AABB2D(200, 200, 5, 5))
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(instance.network.sharedDeleteFragments.size).toBe(1)
        expect(firstClient.store.entities.has(entity.nid)).toBe(false)
        expect(secondClient.store.entities.has(entity.nid)).toBe(false)
    })

    it('keeps SpatialChannel2D visible cell keys cached for movement between populated cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new SpatialChannel2D(instance.localState, 100)

        channel.subscribe(user, new AABB2D(100, 50, 150, 75))
        const first = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 10,
            y: 10,
            label: 'first'
        })
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 20,
            y: 10,
            label: 'second'
        })
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 120,
            y: 10,
            label: 'third'
        })

        const keys = channel.getVisibleCellKeys(user.id)
        first.x = 130
        channel.updateEntity(first)

        expect(channel.getVisibleCellKeys(user.id)).toBe(keys)
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0', '1:0'])
    })

    it('rebuilds SpatialChannel2D visible cell keys when movement changes occupied cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new SpatialChannel2D(instance.localState, 100)

        channel.subscribe(user, new AABB2D(100, 50, 150, 75))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 10,
            y: 10,
            label: 'first'
        })

        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0'])
        entity.x = 130
        channel.updateEntity(entity)

        expect(channel.getVisibleCellKeys(user.id)).toEqual(['1:0'])
    })

    it('spatially culls SpatialChannel2D messages instead of broadcasting them', () => {
        const context = createContext()
        const instance = new Instance(context)
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser, new AABB2D(10, 10, 5, 5))
        channel.subscribe(secondUser, new AABB2D(200, 200, 5, 5))
        channel.addMessage({ ntype: NType.Message, text: 'near', x: 10, y: 10 })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(firstClient.messages).toEqual([{ ntype: NType.Message, text: 'near' }])
        expect(secondClient.messages).toEqual([])
    })

    it('keeps same-cell SpatialChannel2D creates on the normal create path', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(10, 10, 5, 5))
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'first'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const second = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'second'
        })
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.createEntities.map(entity => entity.nid)).toEqual([second.nid])
        expect(clientNetwork.store.get(second.nid)?.label).toBe('second')
    })

    it('keeps same-cell SpatialChannel2D removes on the normal delete path', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(10, 10, 5, 5))
        const first = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'first'
        })
        const second = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'second'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const firstNid = first.nid
        channel.removeEntity(first)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.deleteEntities).toEqual([firstNid])
        expect(clientNetwork.store.entities.has(firstNid)).toBe(false)
        expect(clientNetwork.store.get(second.nid)?.label).toBe('second')
    })

    it('updates SpatialChannel2D visibility correctly when an entity moves between cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser, new AABB2D(10, 10, 5, 5))
        channel.subscribe(secondUser, new AABB2D(60, 10, 5, 5))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'moving'
        })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        const nid = entity.nid
        entity.x = 60
        channel.updateEntity(entity)
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(firstClient.latestFrame?.deleteEntities).toEqual([nid])
        expect(firstClient.store.entities.has(nid)).toBe(false)
        expect(secondClient.latestFrame?.createEntities.map(created => created.nid)).toEqual([nid])
        expect(secondClient.store.get(nid)?.x).toBe(60)
    })

    it('orders SpatialChannel2D leave-cell tree deletes from child to parent', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new SpatialChannel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(10, 10, 5, 5))
        const parent = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'parent'
        })
        const child = instance.attachChild(parent, {
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'child'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const parentNid = parent.nid
        const childNid = child.nid
        channel.updateView(user, new AABB2D(200, 200, 5, 5))
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.deleteEntities).toEqual([childNid, parentNid])
        expect(clientNetwork.store.entities.has(parentNid)).toBe(false)
        expect(clientNetwork.store.entities.has(childNid)).toBe(false)
    })

    it('reruns snapshot writes with binary debug context after a write failure', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)
        instance.network.debugBinaryWrites = true

        channel.subscribe(user)
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: Symbol('bad'),
            y: 6,
            label: 'bad'
        } as any)

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)

        try {
            createSnapshotBuffer(user, instance)
            throw new Error('Expected snapshot write to fail.')
        } catch (err: any) {
            expect(err).toBeInstanceOf(BinaryDebugError)
            expect(err.context).toEqual(expect.objectContaining({
                phase: 'write',
                section: 'CreateEntities',
                index: 0,
                prop: 'x',
                propKey: 0,
                binaryType: Binary.Float64
            }))
            expect(err.message).toContain('CreateEntities')
            expect(err.message).toContain('prop: "x"')
        }
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

        createSnapshotBuffer(user, instance)

        expect(user.responseQueue).toHaveLength(1)
        expect(onResponseBacklog).toHaveBeenCalledWith({
            user,
            queued: 256,
            sent: 255,
            remaining: 1,
            tick: 7
        })

        createSnapshotBuffer(user, instance)

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
        const buffer = createSnapshotBuffer(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(buffer))
        clientNetwork.processNextFrame()

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
        const createBuffer = createSnapshotBuffer(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createBuffer))
        clientNetwork.processNextFrame()

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
        const updateBuffer = createSnapshotBuffer(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(updateBuffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.createEntities).toEqual([])
        expect(clientNetwork.latestFrame?.updateEntities).toEqual([
            { nid, prop: 'x', previous: 5, value: 11 }
        ])
        expect(clientNetwork.store.get(nid)?.x).toBe(11)

        channel.removeEntity(entity)
        instance.tick = 3
        instance.cache.createCachesForTick(instance.tick)
        const deleteBuffer = createSnapshotBuffer(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(deleteBuffer))
        clientNetwork.processNextFrame()

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
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))

        entity.x = 3
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))

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
