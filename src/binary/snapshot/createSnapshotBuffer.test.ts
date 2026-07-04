import { Buffer } from 'buffer'
import createSnapshotBuffer, {
    commitSnapshotPlan,
    countSnapshotBytes,
    writeSnapshot
} from './createSnapshotBuffer'
import { Binary } from '../../common/binary/Binary'
import { DEFAULT_PROTOCOL, byteSizeOfNetworkType } from '../../common/binary/Protocol'
import { defineEntitySchema, defineMessageSchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ResponseStatus } from '../../common/Endpoint'
import { ClientNetwork } from '../../client/ClientNetwork'
import { AABB2D } from '../../server/channel/AABB2D'
import { AABB3D } from '../../server/channel/AABB3D'
import { Channel2D } from '../../server/channel/Channel2D'
import { Channel3D } from '../../server/channel/Channel3D'
import { Channel } from '../../server/channel/Channel'
import { ManualChannel } from '../../server/channel/ManualChannel'
import { ManualChannel2D } from '../../server/channel/ManualChannel2D'
import { ManualChannel3D } from '../../server/channel/ManualChannel3D'
import { EcsChannel } from '../../server/channel/EcsChannel'
import { EcsChannel2D } from '../../server/channel/EcsChannel2D'
import { EcsChannel3D } from '../../server/channel/EcsChannel3D'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { TestBufferWriter, testBinaryAdapter } from '../../testSupport/BufferBinary'
import { createEndpointPayload } from '../endpoint/EndpointPayload'
import { BinaryDiagnosticError } from '../BinaryDiagnosticError'
import { createEmptySnapshotPlan } from './SnapshotPlan'
import { writeChannelScope } from './writeSnapshot'

enum NType {
    Entity = 1,
    Message = 2,
    Transform = 3
}

const CHANNEL_SCOPE_BYTES = 1 + byteSizeOfNetworkType(DEFAULT_PROTOCOL.nidType)

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

function stepClient(instance: Instance, user: User, clientNetwork: ClientNetwork) {
    instance.step()
    clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
    clientNetwork.processNextFrame()
    return clientNetwork.latestFrame!
}

function expectNoDeletedNidUpdates(frameChannel: { deleteEntities: number[], updateEntities: Array<{ nid: number }> }) {
    const deleted = new Set(frameChannel.deleteEntities)
    const updatedDeletedNids = frameChannel.updateEntities
        .map(update => update.nid)
        .filter(nid => deleted.has(nid))
    expect(updatedDeletedNids).toEqual([])
}

type Ecs2DTestChannel = {
    nid: number
    createEntity(): number
    addSpatialComponent<T extends { nid: number, ntype: number }>(pid: number, component: T): T & { pid: number }
    createComponentWriter(ntype: number, schema: any): any
    subscribe(user: User, view: AABB2D): void
    removeEntity(pidOrEntity: number | any): number
    removeComponent(componentOrNid: number | any): void
    updateSpatialComponent(componentOrNid: number | any): void
    updateView(user: User, view: AABB2D): void
    skipInterpolation(pidOrComponent: number | any): boolean
}

function createEcs2DTest(
    view: AABB2D,
    createChannel: (instance: Instance) => Ecs2DTestChannel = instance => new EcsChannel2D(instance.localState, 10)
) {
    const context = createEcsContext()
    const instance = new Instance(context)
    const user = createUser(instance)
    const clientNetwork = createClientNetwork(context)
    const channel = createChannel(instance)
    const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

    instance.users.set(user.id, user)
    channel.subscribe(user, view)

    return { context, instance, user, clientNetwork, channel, Transform, view }
}

function addEcsRoot(channel: Ecs2DTestChannel, x: number, y: number) {
    const pid = channel.createEntity()
    const transform = channel.addSpatialComponent(pid, {
        nid: 0,
        ntype: NType.Transform,
        x,
        y
    })
    return { pid, transform }
}

describe('server snapshot pipeline', () => {
    it('does not miss a same-length all-visible channel membership replacement', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel(instance.localState)

        instance.users.set(user.id, user)
        channel.subscribe(user)
        const first = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'first'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const firstNid = first.nid
        channel.removeEntity(first)
        const replacement = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'replacement'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const frameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(frameChannel.deleteEntities).toEqual([firstNid])
        expect(frameChannel.createEntities.map(entity => entity.nid)).toEqual([replacement.nid])
        expect(clientNetwork.store.entities.has(firstNid)).toBe(false)
        expect(clientNetwork.store.get(replacement.nid)?.label).toBe('replacement')
    })

    it('sends one-frame no-interpolation markers through the binary snapshot pipeline', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel(instance.localState)

        instance.users.set(user.id, user)
        channel.subscribe(user)
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'teleporting'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        entity.x = 400
        channel.skipInterpolation(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        const frame = clientNetwork.processNextFrame()

        expect(frame?.skipInterpolationNids.has(entity.nid)).toBe(true)
        expect(channel.skipInterpolationNids).toEqual([])
    })

    it('counts and writes a collected snapshot plan', () => {
        const context = createContext()
        const plan = createEmptySnapshotPlan()
        plan.createEntities.push({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        })
        plan.messages.push({ ntype: NType.Message, text: 'created' })
        plan.responses.push({ requestId: 77, status: ResponseStatus.Ok, payload: createEndpointPayload({ ok: true }) })
        const byteLength = countSnapshotBytes(plan, context)
        const writer = TestBufferWriter.create(byteLength)

        writeSnapshot(plan, context, writer)

        expect(writer.offset).toBe(byteLength)
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
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).updateEntities).toEqual([
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
        const nschema = context.getSchema(NType.Entity)!
        const firstPlan = createEmptySnapshotPlan()
        const secondPlan = createEmptySnapshotPlan()
        firstPlan.updateEntityGroups = instance.cache.getAndDiffGrouped(instance.tick, first, nschema).groups
        secondPlan.updateEntityGroups = instance.cache.getAndDiffGrouped(instance.tick, second, nschema).groups

        const byteLength = CHANNEL_SCOPE_BYTES +
            countSnapshotBytes(firstPlan, context) +
            CHANNEL_SCOPE_BYTES +
            countSnapshotBytes(secondPlan, context)
        const writer = TestBufferWriter.create(byteLength)
        writeChannelScope(channel.nid, writer)
        writeSnapshot(firstPlan, context, writer)
        writeChannelScope(channel.nid, writer)
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
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)
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
        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).updateEntities.map(update => update.prop)).toEqual(['x', 'y'])
    })

    it('writes manual prop mutations directly', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel(instance.localState)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)
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
        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).updateEntities.map(update => update.prop)).toEqual(['label'])
    })

    it('coalesces repeated ManualChannel writes to final prop values', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel(instance.localState)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)

        instance.users.set(user.id, user)
        channel.subscribe(user)
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'manual'
        })

        stepClient(instance, user, clientNetwork)

        Entity.position(entity, 10, 10)
        Entity.props.x(entity, 20)
        Entity.position(entity, 30, 30)
        Entity.props.y(entity, 40)
        const frame = stepClient(instance, user, clientNetwork)

        expect(frame.requireChannel(channel.nid).updateEntities).toEqual([
            { nid: entity.nid, prop: 'x', previous: 5, value: 30 },
            { nid: entity.nid, prop: 'y', previous: 6, value: 40 }
        ])
        expect(clientNetwork.store.get(entity.nid)?.x).toBe(30)
        expect(clientNetwork.store.get(entity.nid)?.y).toBe(40)
    })

    it('does not scan ManualChannel entities in the mixed-channel fallback', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const manualChannel = new ManualChannel(instance.localState)
        const regularChannel = new Channel(instance.localState)
        const ManualEntity = manualChannel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)

        instance.users.set(user.id, user)
        manualChannel.subscribe(user)
        regularChannel.subscribe(user)
        const manualEntity = manualChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'manual'
        })
        const regularEntity = regularChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 15,
            y: 16,
            label: 'regular'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        manualEntity.x = 50
        regularEntity.x = 150
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(manualEntity.nid)?.x).toBe(5)
        expect(clientNetwork.store.get(regularEntity.nid)?.x).toBe(150)

        manualEntity.x = 55
        ManualEntity.x(manualEntity, 55)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(manualEntity.nid)?.x).toBe(55)
    })

    it('writes manual spatial grouped mutations through cell fragments', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel2D(instance.localState, 100)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)
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

    it('coalesces repeated ManualChannel2D writes to final prop values', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel2D(instance.localState, 100)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(50, 50, 60, 60))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'manual-2d'
        })

        stepClient(instance, user, clientNetwork)

        Entity.position(entity, 10, 10)
        Entity.props.x(entity, 20)
        Entity.position(entity, 30, 30)
        Entity.props.y(entity, 40)
        const frame = stepClient(instance, user, clientNetwork)

        expect(frame.requireChannel(channel.nid).updateEntities).toEqual([
            { nid: entity.nid, prop: 'x', previous: 5, value: 30 },
            { nid: entity.nid, prop: 'y', previous: 6, value: 40 }
        ])
    })

    it('does not scan ManualChannel2D entities in the generic fallback', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel2D(instance.localState, 100)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(50, 50, 60, 60))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'manual-channel'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        entity.label = 'direct-only'
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('manual-channel')

        entity.label = 'manual-write'
        Entity.label(entity, 'manual-write')
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.label).toBe('manual-write')
    })

    it('writes manual spatial 3D grouped mutations through cell fragments', () => {
        const context = createGroupedContext3D()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel3D(instance.localState, 100)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)

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

    it('coalesces repeated ManualChannel3D writes to final prop values', () => {
        const context = createGroupedContext3D()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel3D(instance.localState, 100)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB3D(50, 50, 50, 60, 60, 60))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'manual-3d'
        })

        stepClient(instance, user, clientNetwork)

        Entity.transform(entity, 10, 10, 10)
        Entity.props.x(entity, 20)
        Entity.transform(entity, 30, 30, 30)
        Entity.props.z(entity, 40)
        const frame = stepClient(instance, user, clientNetwork)

        expect(frame.requireChannel(channel.nid).updateEntities).toEqual([
            { nid: entity.nid, prop: 'x', previous: 5, value: 30 },
            { nid: entity.nid, prop: 'y', previous: 6, value: 30 },
            { nid: entity.nid, prop: 'z', previous: 7, value: 40 }
        ])
    })

    it('writes manual spatial grouped child mutations through the parent cell fragment', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel2D(instance.localState, 100)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)
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
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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
        const createFrameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(createFrameChannel.ecsCreateEntities).toEqual([pid])
        expect(createFrameChannel.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
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
        const deleteFrameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(deleteFrameChannel.ecsDeleteEntities).toEqual([pid])
        expect(deleteFrameChannel.deleteEntities).toEqual([componentNid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(componentNid)).toBe(false)
    })

    it('does not scan ECS components without manual writer calls', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel(instance.localState)
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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

        transform.x = 5
        transform.y = 6
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(transform.nid)?.x).toBe(1)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(2)

        transform.x = 7
        transform.y = 8
        Transform.position(transform, 7, 8)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(transform.nid)?.x).toBe(7)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(8)
    })

    it('coalesces repeated EcsChannel writes to final prop values', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel(instance.localState)
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

        instance.users.set(user.id, user)
        channel.subscribe(user)
        const pid = channel.createEntity()
        const transform = channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 6
        })

        stepClient(instance, user, clientNetwork)

        Transform.position(transform, 10, 10)
        Transform.props.x(transform, 20)
        Transform.position(transform, 30, 30)
        Transform.props.y(transform, 40)
        const frame = stepClient(instance, user, clientNetwork)

        expect(frame.requireChannel(channel.nid).updateEntities).toEqual([
            { nid: transform.nid, prop: 'x', previous: 5, value: 30 },
            { nid: transform.nid, prop: 'y', previous: 6, value: 40 }
        ])
        expect(clientNetwork.store.get(transform.nid)?.x).toBe(30)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(40)
    })

    it('can compose ECS and regular channels in one user snapshot', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const ecsChannel = new EcsChannel(instance.localState)
        const regularChannel = new Channel(instance.localState)
        const Transform = ecsChannel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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

        const ecsCreateFrame = clientNetwork.latestFrame!.requireChannel(ecsChannel.nid)
        const regularCreateFrame = clientNetwork.latestFrame!.requireChannel(regularChannel.nid)
        expect(ecsCreateFrame.ecsCreateEntities).toEqual([pid])
        expect(ecsCreateFrame.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
        expect(ecsCreateFrame.createEntities.map(entity => entity.nid)).toEqual([transform.nid])
        expect(regularCreateFrame.createEntities.map(entity => entity.nid)).toEqual([regular.nid])
        expect(clientNetwork.latestFrame?.channels.map(channel => channel.channelId)).toEqual([ecsChannel.nid, regularChannel.nid])
        expect(clientNetwork.latestFrame?.channels[0].ecsCreateEntities).toEqual([pid])
        expect(clientNetwork.latestFrame?.channels[0].ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
        expect(clientNetwork.latestFrame?.channels[1].createEntities.map(entity => entity.nid)).toEqual([regular.nid])
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
        expect(clientNetwork.latestFrame?.channels[0].updateEntities.map(update => update.nid)).toEqual([transform.nid, transform.nid])
        expect(clientNetwork.latestFrame?.channels[1].updateEntities.map(update => update.nid)).toEqual([regular.nid])

        const transformNid = transform.nid
        const regularNid = regular.nid
        ecsChannel.removeEntity(pid)
        regularChannel.removeEntity(regular)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.previousSnapshot?.deleteEntities).toEqual([])
        const ecsDeleteFrame = clientNetwork.latestFrame!.requireChannel(ecsChannel.nid)
        const regularDeleteFrame = clientNetwork.latestFrame!.requireChannel(regularChannel.nid)
        expect(ecsDeleteFrame.ecsDeleteEntities).toEqual([pid])
        expect(ecsDeleteFrame.deleteEntities).toEqual([transformNid])
        expect(regularDeleteFrame.deleteEntities).toEqual([regularNid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(transformNid)).toBe(false)
        expect(clientNetwork.store.entities.has(regularNid)).toBe(false)
    })

    it('sends unsubscribe deletes without merging away remaining channel updates', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const worldChannel = new Channel(instance.localState)
        const inventoryChannel = new Channel(instance.localState)

        instance.users.set(user.id, user)
        worldChannel.subscribe(user)
        inventoryChannel.subscribe(user)

        const worldEntity = worldChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'world'
        })
        const item = inventoryChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'item'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const itemNid = item.nid
        inventoryChannel.unsubscribe(user)
        worldEntity.x = 10

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.closedChannels).toEqual([
            {
                channelId: inventoryChannel.nid,
                header: inventoryChannel.header,
                entityNids: [itemNid]
            }
        ])
        expect(clientNetwork.store.get(worldEntity.nid)?.x).toBe(10)
        expect(clientNetwork.store.entities.has(itemNid)).toBe(false)
    })

    it('sends close and open when a destroyed channel id is reused before the next snapshot', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const firstChannel = new EcsChannel(instance.localState, { name: 'first' })

        instance.users.set(user.id, user)
        firstChannel.subscribe(user)

        const firstPid = firstChannel.createEntity()
        const firstTransform = firstChannel.addComponent(firstPid, {
            nid: 0,
            ntype: NType.Transform,
            x: 1,
            y: 2
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const reusedChannelId = firstChannel.nid
        const firstTransformNid = firstTransform.nid
        firstChannel.destroy()
        instance.localState.releaseDeferredIds()

        let secondChannel = new EcsChannel(instance.localState, { name: 'second' })
        while (secondChannel.nid !== reusedChannelId) {
            secondChannel = new EcsChannel(instance.localState, { name: 'second' })
        }
        secondChannel.subscribe(user)

        const secondPid = secondChannel.createEntity()
        const secondTransform = secondChannel.addComponent(secondPid, {
            nid: 0,
            ntype: NType.Transform,
            x: 10,
            y: 20
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const frame = clientNetwork.latestFrame!
        expect(frame.closedChannels).toEqual([{
            channelId: reusedChannelId,
            header: expect.objectContaining({ name: 'first' }),
            entityNids: expect.arrayContaining([firstPid, firstTransformNid])
        }])
        expect(frame.openedChannels).toEqual([{
            channelId: reusedChannelId,
            header: expect.objectContaining({ name: 'second' })
        }])
        expect(frame.requireChannel(reusedChannelId).ecsCreateEntities).toEqual([secondPid])
        expect(frame.requireChannel(reusedChannelId).ecsCreateComponents).toEqual([
            expect.objectContaining({
                nid: secondTransform.nid,
                pid: secondPid,
                x: 10,
                y: 20
            })
        ])
        expect(clientNetwork.store.get(secondTransform.nid)).toEqual(expect.objectContaining({
            pid: secondPid,
            x: 10,
            y: 20
        }))
        expect(user.knownChannelIds.has(reusedChannelId)).toBe(true)
    })

    it('spatially replicates ECS roots from component state', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel2D(instance.localState, 10)
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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

        const createFrameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(createFrameChannel.ecsCreateEntities).toEqual([pid])
        expect(createFrameChannel.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
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
        const deleteFrameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(deleteFrameChannel.ecsDeleteEntities).toEqual([pid])
        expect(deleteFrameChannel.deleteEntities).toEqual([transform.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false)
    })

    it('decodes same-snapshot ECS spatial creates and manual updates', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel2D(instance.localState, 10)
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(5, 5, 10, 10))
        const pid = channel.createEntity()
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 5
        })
        transform.x = 6
        transform.y = 7
        Transform.position(transform, 6, 7)

        instance.step()
        expect(() => {
            clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        }).not.toThrow()
        clientNetwork.processNextFrame()

        const frameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(frameChannel.ecsCreateEntities).toEqual([pid])
        expect(frameChannel.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
        expect(clientNetwork.store.get(transform.nid)?.x).toBe(6)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(7)
    })

    describe('ECS spatial visibility transitions', () => {
        it('applies queued ECS spatial movement snapshots after the subscriber view crosses cells', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 4, 4))
            const { transform } = addEcsRoot(game.channel, 5, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            const send = game.user.networkAdapter.send as jest.Mock
            send.mockClear()

            const positions = [20, 35, 50, 65, 80]
            positions.forEach(x => {
                transform.x = x
                game.Transform.groups.position(transform, transform.x, transform.y)
                game.channel.updateSpatialComponent(transform)
                game.channel.updateView(game.user, new AABB2D(x, 5, 4, 4))
                game.instance.step()
            })

            const buffers = send.mock.calls.map(call => call[1] as Buffer)
            expect(buffers).toHaveLength(positions.length)
            expect(() => {
                buffers.forEach(buffer => {
                    game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(buffer))
                })
                game.clientNetwork.drainFrames()
            }).not.toThrow()
            expect(game.clientNetwork.store.get(transform.nid)?.x).toBe(positions[positions.length - 1])
            expect(game.clientNetwork.store.getEntityChannelId(transform.nid)).toBe(game.channel.nid)
        })

        it('applies queued ECS spatial snapshots while a followed view passes world entities', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 8, 8))
            const { transform: playerTransform } = addEcsRoot(game.channel, 5, 5)
            const worldTransforms = [
                addEcsRoot(game.channel, 25, 5).transform,
                addEcsRoot(game.channel, 45, 5).transform,
                addEcsRoot(game.channel, 65, 5).transform,
                addEcsRoot(game.channel, 85, 5).transform,
                addEcsRoot(game.channel, 105, 5).transform
            ]

            stepClient(game.instance, game.user, game.clientNetwork)

            const send = game.user.networkAdapter.send as jest.Mock
            send.mockClear()

            for (let tick = 1; tick <= 40; tick++) {
                const x = 5 + tick * 3
                playerTransform.x = x
                game.Transform.groups.position(playerTransform, playerTransform.x, playerTransform.y)
                game.channel.updateSpatialComponent(playerTransform)
                game.channel.updateView(game.user, new AABB2D(x, 5, 8, 8))

                worldTransforms.forEach((transform, index) => {
                    transform.y = 5 + ((tick + index) % 3)
                    game.Transform.groups.position(transform, transform.x, transform.y)
                    game.channel.updateSpatialComponent(transform)
                })

                game.instance.step()
            }

            const buffers = send.mock.calls.map(call => call[1] as Buffer)
            expect(buffers).toHaveLength(40)
            expect(() => {
                buffers.forEach(buffer => {
                    game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(buffer))
                })
                game.clientNetwork.drainFrames()
            }).not.toThrow()
            expect(game.clientNetwork.store.get(playerTransform.nid)?.x).toBe(125)
            expect(game.clientNetwork.store.getEntityChannelId(playerTransform.nid)).toBe(game.channel.nid)
        })

        it('applies one ECS spatial snapshot after many followed-view moves in one server frame', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 8, 8))
            const { transform: playerTransform } = addEcsRoot(game.channel, 5, 5)
            const worldTransforms = [
                addEcsRoot(game.channel, 25, 5).transform,
                addEcsRoot(game.channel, 45, 5).transform,
                addEcsRoot(game.channel, 65, 5).transform,
                addEcsRoot(game.channel, 85, 5).transform,
                addEcsRoot(game.channel, 105, 5).transform,
                addEcsRoot(game.channel, 125, 5).transform,
                addEcsRoot(game.channel, 145, 5).transform,
                addEcsRoot(game.channel, 165, 5).transform
            ]

            stepClient(game.instance, game.user, game.clientNetwork)

            for (let move = 1; move <= 200; move++) {
                const x = 5 + move
                playerTransform.x = x
                game.Transform.groups.position(playerTransform, playerTransform.x, playerTransform.y)
                game.channel.updateSpatialComponent(playerTransform)
                game.channel.updateView(game.user, new AABB2D(x, 5, 8, 8))

                worldTransforms.forEach((transform, index) => {
                    transform.y = 5 + ((move + index) % 3)
                    game.Transform.groups.position(transform, transform.x, transform.y)
                    game.channel.updateSpatialComponent(transform)
                })
            }

            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            expect(game.clientNetwork.store.get(playerTransform.nid)?.x).toBe(205)
            expect(game.clientNetwork.store.getEntityChannelId(playerTransform.nid)).toBe(game.channel.nid)
        })

        it('uses final ECS spatial view after many server-side view updates in one frame', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 4, 4))
            const worldTransforms = [
                addEcsRoot(game.channel, 5, 5).transform,
                addEcsRoot(game.channel, 25, 5).transform,
                addEcsRoot(game.channel, 45, 5).transform,
                addEcsRoot(game.channel, 65, 5).transform,
                addEcsRoot(game.channel, 85, 5).transform
            ]

            stepClient(game.instance, game.user, game.clientNetwork)

            for (let i = 0; i < 200; i++) {
                const x = 5 + i * 0.4
                const nearby = worldTransforms[Math.min(worldTransforms.length - 1, Math.floor(x / 20))]
                nearby.y = 5 + (i % 4)
                game.Transform.props.y(nearby, nearby.y)
                game.channel.updateSpatialComponent(nearby)
                game.channel.updateView(game.user, new AABB2D(x, 5, 4, 4))
            }

            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()

            const frameChannel = game.clientNetwork.latestFrame!.requireChannel(game.channel.nid)
            expect(frameChannel.deleteEntities).toContain(worldTransforms[0].nid)
            expect(frameChannel.updateEntities.map(update => update.nid)).not.toContain(worldTransforms[0].nid)
            expect(game.clientNetwork.store.get(worldTransforms[0].nid)).toBeUndefined()
            expect(game.clientNetwork.store.get(worldTransforms[4].nid)?.x).toBe(85)
        })

        it('does not send stale ECS spatial updates for components deleted in the same snapshot', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 4, 4))
            const { pid, transform } = addEcsRoot(game.channel, 5, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            transform.x = 6
            game.Transform.groups.position(transform, transform.x, transform.y)
            game.channel.removeEntity(pid)
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            expect(game.clientNetwork.store.get(transform.nid)).toBeUndefined()
            expect(game.clientNetwork.store.getEntityChannelId(transform.nid)).toBeUndefined()
        })

        it('does not send stale ECS spatial updates when another entity keeps the dirty cell visible', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 4, 4))
            const removed = addEcsRoot(game.channel, 5, 5)
            const survivor = addEcsRoot(game.channel, 6, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            removed.transform.x = 7
            game.Transform.groups.position(removed.transform, removed.transform.x, removed.transform.y)
            game.channel.removeEntity(removed.pid)
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            expectNoDeletedNidUpdates(game.clientNetwork.latestFrame!.requireChannel(game.channel.nid))
            expect(game.clientNetwork.store.get(removed.transform.nid)).toBeUndefined()
            expect(game.clientNetwork.store.get(survivor.transform.nid)?.x).toBe(6)
        })

        it('does not reuse dirty ECS spatial cell fragments across users after a same-tick delete', () => {
            const context = createEcsContext()
            const instance = new Instance(context)
            const firstUser = createUser(instance)
            const secondUser = createUser(instance)
            secondUser.id = 2
            const firstClient = createClientNetwork(context)
            const secondClient = createClientNetwork(context)
            const channel = new EcsChannel2D(instance.localState, 10)
            const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

            instance.users.set(firstUser.id, firstUser)
            instance.users.set(secondUser.id, secondUser)
            channel.subscribe(firstUser, new AABB2D(5, 5, 4, 4))
            channel.subscribe(secondUser, new AABB2D(5, 5, 4, 4))

            const removedPid = channel.createEntity()
            const removed = channel.addSpatialComponent(removedPid, {
                nid: 0,
                ntype: NType.Transform,
                x: 5,
                y: 5
            })
            const survivorPid = channel.createEntity()
            const survivor = channel.addSpatialComponent(survivorPid, {
                nid: 0,
                ntype: NType.Transform,
                x: 6,
                y: 5
            })

            instance.step()
            firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
            firstClient.processNextFrame()
            secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
            secondClient.processNextFrame()

            removed.x = 7
            Transform.groups.position(removed, removed.x, removed.y)
            const removedNid = removed.nid
            channel.removeEntity(removedPid)
            instance.step()

            firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
            firstClient.processNextFrame()
            secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
            secondClient.processNextFrame()

            const firstFrameChannel = firstClient.latestFrame!.requireChannel(channel.nid)
            const secondFrameChannel = secondClient.latestFrame!.requireChannel(channel.nid)
            expect(firstFrameChannel.deleteEntities).toContain(removedNid)
            expect(secondFrameChannel.deleteEntities).toContain(removedNid)
            expectNoDeletedNidUpdates(firstFrameChannel)
            expectNoDeletedNidUpdates(secondFrameChannel)
            expect(firstClient.store.get(removedNid)).toBeUndefined()
            expect(secondClient.store.get(removedNid)).toBeUndefined()
            expect(firstClient.store.get(survivor.nid)?.x).toBe(6)
            expect(secondClient.store.get(survivor.nid)?.x).toBe(6)
        })

        it('does not send stale ECS spatial updates for components deleted from a dirty visible cell', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 4, 4))
            const removed = addEcsRoot(game.channel, 5, 5)
            const survivor = addEcsRoot(game.channel, 6, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            removed.transform.x = 7
            game.Transform.props.x(removed.transform, removed.transform.x)
            game.channel.removeComponent(removed.transform.nid)
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            expectNoDeletedNidUpdates(game.clientNetwork.latestFrame!.requireChannel(game.channel.nid))
            expect(game.clientNetwork.store.get(removed.transform.nid)).toBeUndefined()
            expect(game.clientNetwork.store.get(survivor.transform.nid)?.x).toBe(6)
        })

        it('does not send stale ECS spatial prop updates after a visibility-only delete', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 4, 4))
            const leaving = addEcsRoot(game.channel, 5, 5)
            const entering = addEcsRoot(game.channel, 50, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            leaving.transform.x = 6
            game.Transform.props.x(leaving.transform, leaving.transform.x)
            game.channel.updateSpatialComponent(leaving.transform)
            game.channel.updateView(game.user, new AABB2D(50, 5, 4, 4))
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            const frameChannel = game.clientNetwork.latestFrame!.requireChannel(game.channel.nid)
            expect(frameChannel.updateEntities.map(update => update.nid)).not.toContain(leaving.transform.nid)
            expect(game.clientNetwork.store.get(leaving.transform.nid)).toBeUndefined()
            expect(game.clientNetwork.store.get(entering.transform.nid)?.x).toBe(50)
        })

        it('does not send stale ECS spatial prop updates when a persistent entity teleports out of view', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 4, 4))
            const hazard = addEcsRoot(game.channel, 5, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            hazard.transform.y = 500
            game.Transform.props.y(hazard.transform, hazard.transform.y)
            game.channel.skipInterpolation(hazard.transform)
            game.channel.updateSpatialComponent(hazard.transform)
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            const frameChannel = game.clientNetwork.latestFrame!.requireChannel(game.channel.nid)
            expect(frameChannel.updateEntities.map(update => update.nid)).not.toContain(hazard.transform.nid)
            expect(game.clientNetwork.store.get(hazard.transform.nid)).toBeUndefined()
        })

        it('coalesces repeated ECS spatial manual writes to final prop values', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 4, 4))
            const { transform } = addEcsRoot(game.channel, 5, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            game.Transform.groups.position(transform, 10, 10)
            game.Transform.props.x(transform, 20)
            game.Transform.groups.position(transform, 30, 30)
            game.Transform.props.y(transform, 40)
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()

            const frameUpdates = game.clientNetwork.latestFrame!.requireChannel(game.channel.nid).updateEntities
                .filter(update => update.nid === transform.nid)
            expect(frameUpdates).toEqual([
                { nid: transform.nid, prop: 'x', previous: 5, value: 30 },
                { nid: transform.nid, prop: 'y', previous: 5, value: 40 }
            ])
            expect(game.clientNetwork.store.get(transform.nid)?.x).toBe(30)
            expect(game.clientNetwork.store.get(transform.nid)?.y).toBe(40)
        })

        it('keeps overlapping ECS spatial views synchronized for clustered cell-junction movement', () => {
            const context = createEcsContext()
            const instance = new Instance(context)
            instance.network.sharedUpdateFragmentsEnabled = true
            const firstUser = createUser(instance)
            const secondUser = createUser(instance)
            secondUser.id = 2
            const firstClient = createClientNetwork(context)
            const secondClient = createClientNetwork(context)
            const channel = new EcsChannel2D(instance.localState, 10)
            const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

            instance.users.set(firstUser.id, firstUser)
            instance.users.set(secondUser.id, secondUser)
            channel.subscribe(firstUser, new AABB2D(10, 10, 10, 10))
            channel.subscribe(secondUser, new AABB2D(11, 11, 10, 10))
            const roots = [
                addEcsRoot(channel, 9.9, 9.9),
                addEcsRoot(channel, 10.1, 9.9),
                addEcsRoot(channel, 9.9, 10.1),
                addEcsRoot(channel, 10.1, 10.1)
            ]
            const finals = [
                [10.5, 10.5],
                [9.5, 10.5],
                [10.5, 9.5],
                [9.5, 9.5]
            ] as const

            instance.step()
            firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
            firstClient.processNextFrame()
            secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
            secondClient.processNextFrame()

            for (let i = 0; i < roots.length; i++) {
                const transform = roots[i].transform
                transform.x = 20 - finals[i][0]
                transform.y = 20 - finals[i][1]
                Transform.position(transform, transform.x, transform.y)
                transform.x = finals[i][0]
                transform.y = finals[i][1]
                Transform.position(transform, transform.x, transform.y)
            }

            instance.step()
            firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
            firstClient.processNextFrame()
            secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
            secondClient.processNextFrame()

            for (const client of [firstClient, secondClient]) {
                const updates = client.latestFrame!.requireChannel(channel.nid).updateEntities
                    .filter(update => roots.some(root => root.transform.nid === update.nid))
                expect(updates).toHaveLength(roots.length * 2)
                expect(new Set(updates.map(update => `${update.nid}:${update.prop}`)).size).toBe(roots.length * 2)
                for (let i = 0; i < roots.length; i++) {
                    expect(client.store.get(roots[i].transform.nid)?.x).toBe(finals[i][0])
                    expect(client.store.get(roots[i].transform.nid)?.y).toBe(finals[i][1])
                }
            }
        })

        it('does not send stale ECS channel updates for components deleted in the same snapshot', () => {
            const game = createEcs2DTest(
                new AABB2D(5, 5, 4, 4),
                instance => new EcsChannel2D(instance.localState, 10)
            )
            const { pid, transform } = addEcsRoot(game.channel, 5, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            transform.x = 6
            game.Transform.groups.position(transform, transform.x, transform.y)
            game.channel.removeEntity(pid)
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            expect(game.clientNetwork.store.get(transform.nid)).toBeUndefined()
            expect(game.clientNetwork.store.getEntityChannelId(transform.nid)).toBeUndefined()
        })

        it('does not send stale ECS channel updates when another entity keeps the dirty cell visible', () => {
            const game = createEcs2DTest(
                new AABB2D(5, 5, 4, 4),
                instance => new EcsChannel2D(instance.localState, 10)
            )
            const removed = addEcsRoot(game.channel, 5, 5)
            const survivor = addEcsRoot(game.channel, 6, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            removed.transform.x = 7
            game.Transform.groups.position(removed.transform, removed.transform.x, removed.transform.y)
            game.channel.removeEntity(removed.pid)
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            expect(game.clientNetwork.store.get(removed.transform.nid)).toBeUndefined()
            expect(game.clientNetwork.store.get(survivor.transform.nid)?.x).toBe(6)
        })

        it('does not send stale ECS channel prop updates after a visibility-only delete', () => {
            const game = createEcs2DTest(
                new AABB2D(5, 5, 4, 4),
                instance => new EcsChannel2D(instance.localState, 10)
            )
            const leaving = addEcsRoot(game.channel, 5, 5)
            const entering = addEcsRoot(game.channel, 50, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            leaving.transform.x = 6
            game.Transform.props.x(leaving.transform, leaving.transform.x)
            game.channel.updateSpatialComponent(leaving.transform)
            game.channel.updateView(game.user, new AABB2D(50, 5, 4, 4))
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            const frameChannel = game.clientNetwork.latestFrame!.requireChannel(game.channel.nid)
            expect(frameChannel.updateEntities.map(update => update.nid)).not.toContain(leaving.transform.nid)
            expect(game.clientNetwork.store.get(leaving.transform.nid)).toBeUndefined()
            expect(game.clientNetwork.store.get(entering.transform.nid)?.x).toBe(50)
        })

        it('uses ECS channel snapshots without legacy user visibility state', () => {
            const game = createEcs2DTest(
                new AABB2D(5, 5, 4, 4),
                instance => new EcsChannel2D(instance.localState, 10)
            )
            const { transform } = addEcsRoot(game.channel, 5, 5)

            transform.x = 6
            transform.y = 6
            game.Transform.groups.position(transform, 6, 6)
            game.instance.step()

            expect(() => {
                game.clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(game.user)))
            }).not.toThrow()
            expect(() => game.clientNetwork.processNextFrame()).not.toThrow()
            expect(game.clientNetwork.store.get(transform.nid)?.x).toBe(6)
            expect(game.clientNetwork.store.get(transform.nid)?.y).toBe(6)
        })

        it('creates roots when the subscriber view moves into them', () => {
            const game = createEcs2DTest(new AABB2D(500, 500, 10, 10))
            const { pid, transform } = addEcsRoot(game.channel, 5, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            game.view.x = 5
            game.view.y = 5
            game.channel.updateView(game.user, game.view)
            const frame = stepClient(game.instance, game.user, game.clientNetwork)

            const frameChannel = frame.requireChannel(game.channel.nid)
            expect(frameChannel.ecsCreateEntities).toEqual([pid])
            expect(frameChannel.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
            expect(game.clientNetwork.store.ecsEntities.has(pid)).toBe(true)
            expect(game.clientNetwork.store.get(transform.nid)?.x).toBe(5)
        })

        it('creates roots when they move into the subscriber view', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 10, 10))
            const { pid, transform } = addEcsRoot(game.channel, 500, 500)

            stepClient(game.instance, game.user, game.clientNetwork)

            transform.x = 5
            transform.y = 5
            game.Transform.position(transform, 5, 5)
            const frame = stepClient(game.instance, game.user, game.clientNetwork)

            const frameChannel = frame.requireChannel(game.channel.nid)
            expect(frameChannel.ecsCreateEntities).toEqual([pid])
            expect(frameChannel.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
            expect(game.clientNetwork.store.ecsEntities.has(pid)).toBe(true)
            expect(game.clientNetwork.store.get(transform.nid)?.x).toBe(5)
        })

        it('creates roots when game logic spawns them inside the subscriber view', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 10, 10))

            stepClient(game.instance, game.user, game.clientNetwork)
            const { pid, transform } = addEcsRoot(game.channel, 5, 5)
            const frame = stepClient(game.instance, game.user, game.clientNetwork)

            const frameChannel = frame.requireChannel(game.channel.nid)
            expect(frameChannel.ecsCreateEntities).toEqual([pid])
            expect(frameChannel.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
            expect(game.clientNetwork.store.ecsEntities.has(pid)).toBe(true)
            expect(game.clientNetwork.store.get(transform.nid)?.x).toBe(5)
        })

        it('deletes roots when the subscriber view moves away from them', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 10, 10))
            const { pid, transform } = addEcsRoot(game.channel, 5, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            game.view.x = 500
            game.view.y = 500
            game.channel.updateView(game.user, game.view)
            const frame = stepClient(game.instance, game.user, game.clientNetwork)

            const frameChannel = frame.requireChannel(game.channel.nid)
            expect(frameChannel.ecsDeleteEntities).toEqual([pid])
            expect(frameChannel.deleteEntities).toEqual([transform.nid])
            expect(game.clientNetwork.store.ecsEntities.has(pid)).toBe(false)
            expect(game.clientNetwork.store.entities.has(transform.nid)).toBe(false)
        })

        it('deletes roots when they move out of the subscriber view', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 10, 10))
            const { pid, transform } = addEcsRoot(game.channel, 5, 5)

            stepClient(game.instance, game.user, game.clientNetwork)

            transform.x = 500
            transform.y = 500
            game.Transform.position(transform, 500, 500)
            const frame = stepClient(game.instance, game.user, game.clientNetwork)

            const frameChannel = frame.requireChannel(game.channel.nid)
            expect(frameChannel.ecsDeleteEntities).toEqual([pid])
            expect(frameChannel.deleteEntities).toEqual([transform.nid])
            expect(game.clientNetwork.store.ecsEntities.has(pid)).toBe(false)
            expect(game.clientNetwork.store.entities.has(transform.nid)).toBe(false)
        })

        it('deletes roots when game logic removes them from the channel', () => {
            const game = createEcs2DTest(new AABB2D(5, 5, 10, 10))
            const { pid, transform } = addEcsRoot(game.channel, 5, 5)
            const transformNid = transform.nid

            stepClient(game.instance, game.user, game.clientNetwork)

            game.channel.removeEntity(pid)
            const frame = stepClient(game.instance, game.user, game.clientNetwork)

            const frameChannel = frame.requireChannel(game.channel.nid)
            expect(frameChannel.ecsDeleteEntities).toEqual([pid])
            expect(frameChannel.deleteEntities).toEqual([transformNid])
            expect(game.clientNetwork.store.ecsEntities.has(pid)).toBe(false)
            expect(game.clientNetwork.store.entities.has(transformNid)).toBe(false)
        })
    })

    it('does not scan ECS spatial components without manual writer calls', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel2D(instance.localState, 10)
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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

        transform.x = 6
        transform.y = 7
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(transform.nid)?.x).toBe(5)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(5)

        transform.x = 8
        transform.y = 9
        Transform.position(transform, 8, 9)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(transform.nid)?.x).toBe(8)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(9)
    })

    it('spatially replicates ECS roots from 3D component state', () => {
        const context = createEcsContext3D()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel3D(instance.localState, 10)
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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

        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).ecsCreateEntities).toEqual([pid])
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

        const deleteFrameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(deleteFrameChannel.ecsDeleteEntities).toEqual([pid])
        expect(deleteFrameChannel.deleteEntities).toEqual([transform.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false)
    })

    it('coalesces repeated ECS spatial 3D manual writes to final prop values', () => {
        const context = createEcsContext3D()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel3D(instance.localState, 10)
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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

        Transform.groups.position(transform, 10, 10, 10)
        Transform.props.x(transform, 20)
        Transform.groups.position(transform, 30, 30, 30)
        Transform.props.z(transform, 40)
        instance.step()

        expect(() => {
            clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        }).not.toThrow()
        expect(() => clientNetwork.processNextFrame()).not.toThrow()

        const frameUpdates = clientNetwork.latestFrame!.requireChannel(channel.nid).updateEntities
            .filter(update => update.nid === transform.nid)
        expect(frameUpdates).toEqual([
            { nid: transform.nid, prop: 'x', previous: 5, value: 30 },
            { nid: transform.nid, prop: 'y', previous: 5, value: 30 },
            { nid: transform.nid, prop: 'z', previous: 5, value: 40 }
        ])
        expect(clientNetwork.store.get(transform.nid)?.x).toBe(30)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(30)
        expect(clientNetwork.store.get(transform.nid)?.z).toBe(40)
    })

    it('spatially replicates existing ECS roots when a user subscribes after creation', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel2D(instance.localState, 10)

        instance.users.set(user.id, user)
        const pid = channel.createEntity()
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 5
        })
        instance.step()

        channel.subscribe(user, new AABB2D(5, 5, 10, 10))
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const frameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(frameChannel.ecsCreateEntities).toEqual([pid])
        expect(frameChannel.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true)
        expect(clientNetwork.store.get(transform.nid)?.x).toBe(5)
    })

    it('spatially replicates existing composed ECS roots when a user subscribes after creation', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel2D(instance.localState, 10)

        instance.users.set(user.id, user)
        const pid = channel.createEntity()
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 5
        })
        const body = channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'npc'
        })
        instance.step()

        channel.subscribe(user, new AABB2D(5, 5, 10, 10))
        instance.step()

        expect(() => {
            clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        }).not.toThrow()
        clientNetwork.processNextFrame()

        const frameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(frameChannel.ecsCreateEntities).toEqual([pid])
        expect(frameChannel.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid, body.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true)
        expect(clientNetwork.store.get(transform.nid)?.x).toBe(5)
        expect(clientNetwork.store.get(body.nid)?.label).toBe('npc')
    })

    it('spatially replicates many existing composed ECS roots after nid width grows', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel2D(instance.localState, 10)
        const createdBodies: any[] = []

        for (let i = 0; i < 130; i++) {
            const pid = channel.createEntity()
            channel.addSpatialComponent(pid, {
                nid: 0,
                ntype: NType.Transform,
                x: 5 + i,
                y: 5
            })
            createdBodies.push(channel.addComponent(pid, {
                nid: 0,
                ntype: NType.Entity,
                x: 0,
                y: 0,
                label: `npc-${i}`
            }))
        }
        instance.step()

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(70, 5, 100, 10))
        instance.step()

        expect(() => {
            clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        }).not.toThrow()
        clientNetwork.processNextFrame()

        const frameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(frameChannel.ecsCreateEntities).toHaveLength(130)
        expect(frameChannel.ecsCreateComponents).toHaveLength(260)
        expect(clientNetwork.store.get(createdBodies[129].nid)?.label).toBe('npc-129')
    })

    it('spatially replicates ECS roots on the xz plane without copying z into y', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new EcsChannel2D(instance.localState, 10, { plane: 'xz' })
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)

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

        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).ecsCreateEntities).toEqual([pid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true)
        expect(clientNetwork.store.get(transform.nid)?.y).toBe(500)

        transform.x = 6
        transform.y = 501
        transform.z = 50
        Transform.position(transform, 6, 501)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const deleteFrameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(deleteFrameChannel.ecsDeleteEntities).toEqual([pid])
        expect(deleteFrameChannel.deleteEntities).toEqual([transform.nid])
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false)
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false)
    })

    it('updates manual spatial visibility when movement changes occupied cells', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new ManualChannel2D(instance.localState, 100)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)
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
        const channel = new ManualChannel2D(instance.localState, 100, { plane: 'xz' })
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)

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
        const channel = new ManualChannel2D(instance.localState, 100)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)
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

        expect(firstClient.latestFrame!.requireChannel(channel.nid).deleteEntities).toEqual([moverNid])
        expect(firstClient.store.entities.has(moverNid)).toBe(false)
        expect(secondClient.latestFrame!.requireChannel(channel.nid).createEntities.map(entity => entity.nid)).toContain(moverNid)
        expect(secondClient.store.get(moverNid)?.x).toBe(150)
    })

    it('keeps overlapping manual spatial views synchronized for clustered cell-junction movement', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new ManualChannel2D(instance.localState, 10)
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity)!)

        instance.users.set(firstUser.id, firstUser)
        instance.users.set(secondUser.id, secondUser)
        channel.subscribe(firstUser, new AABB2D(10, 10, 10, 10))
        channel.subscribe(secondUser, new AABB2D(11, 11, 10, 10))
        const entities = [
            channel.addEntity({ nid: 0, ntype: NType.Entity, x: 9.9, y: 9.9, label: 'nw' }),
            channel.addEntity({ nid: 0, ntype: NType.Entity, x: 10.1, y: 9.9, label: 'ne' }),
            channel.addEntity({ nid: 0, ntype: NType.Entity, x: 9.9, y: 10.1, label: 'sw' }),
            channel.addEntity({ nid: 0, ntype: NType.Entity, x: 10.1, y: 10.1, label: 'se' })
        ]
        const finals = [
            [10.5, 10.5],
            [9.5, 10.5],
            [10.5, 9.5],
            [9.5, 9.5]
        ] as const

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i]
            entity.x = 20 - finals[i][0]
            entity.y = 20 - finals[i][1]
            Entity.position(entity, entity.x, entity.y)
            entity.x = finals[i][0]
            entity.y = finals[i][1]
            Entity.position(entity, entity.x, entity.y)
        }

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        for (const client of [firstClient, secondClient]) {
            const updates = client.latestFrame!.requireChannel(channel.nid).updateEntities
                .filter(update => entities.some(entity => entity.nid === update.nid))
            expect(updates).toHaveLength(entities.length * 2)
            expect(new Set(updates.map(update => `${update.nid}:${update.prop}`)).size).toBe(entities.length * 2)
            for (let i = 0; i < entities.length; i++) {
                expect(client.store.get(entities[i].nid)?.x).toBe(finals[i][0])
                expect(client.store.get(entities[i].nid)?.y).toBe(finals[i][1])
            }
        }
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
        expect(firstClient.latestFrame!.requireChannel(channel.nid).createEntities.map(entity => entity.nid)).toEqual([crateNid, itemNid])
        expect(secondClient.latestFrame!.requireChannel(channel.nid).createEntities.map(entity => entity.nid)).toEqual([crateNid, itemNid])
        expect(firstClient.store.get(itemNid)?.label).toBe('item')
        expect(secondClient.store.get(itemNid)?.label).toBe('item')

        channel.removeEntity(crate)
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(instance.network.sharedDeleteFragments.size).toBe(1)
        expect(firstClient.latestFrame!.requireChannel(channel.nid).deleteEntities).toEqual([itemNid, crateNid])
        expect(secondClient.latestFrame!.requireChannel(channel.nid).deleteEntities).toEqual([itemNid, crateNid])
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
        expect(existingClient.latestFrame!.requireChannel(channel.nid).createEntities.map(entity => entity.nid)).toEqual([added.nid])
        expect(newClient.latestFrame!.requireChannel(channel.nid).createEntities.map(entity => entity.nid)).toEqual([initial.nid, added.nid])
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
        expect(clientNetwork.latestFrame!.hasChannel(channel.nid)).toBe(false)
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
        channel.addInterpolatedMessage({ ntype: NType.Message, text: 'broadcast-fx' })
        firstUser.queueMessage({ ntype: NType.Message, text: 'private' })

        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(firstClient.latestFrame?.messages).toEqual([
            { ntype: NType.Message, text: 'private' }
        ])
        expect(secondClient.latestFrame?.messages).toEqual([])
        expect(firstClient.latestFrame?.interpolatedMessages).toEqual([])
        expect(secondClient.latestFrame?.interpolatedMessages).toEqual([])
        expect(firstClient.latestFrame?.channels).toEqual([
            expect.objectContaining({
                channelId: channel.nid,
                messages: [{ ntype: NType.Message, text: 'broadcast' }],
                interpolatedMessages: [{ ntype: NType.Message, text: 'broadcast-fx' }]
            })
        ])
        expect(channel.broadcastMessages).toEqual([])
        expect(channel.interpolatedBroadcastMessages).toEqual([])
        expect(instance.network.snapshotPerformance.sharedMessageFragmentBuilds).toBe(1)
        expect(instance.network.snapshotPerformance.sharedMessageFragmentHits).toBe(1)
        expect(instance.network.snapshotPerformance.messagesTotal).toBe(5)
    })

    it('can use reusable cell update fragments without userland moveEntity calls', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

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

    it('uses the xz plane for Channel2D visibility without copying z into y', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50, { plane: 'xz' })

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
        channel.moveEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
    })

    it('uses true 3D cells for Channel3D visibility', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel3D(instance.localState, 50)

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

    it('uses coarse circle cells for Channel2D visibility', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

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
        channel.moveEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
        expect(channel.getVisibleCellKeys(user.id)).toEqual([])
    })

    it('uses coarse sphere cells for Channel3D visibility', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel3D(instance.localState, 50)

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
        channel.moveEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
        expect(channel.getVisibleCellKeys(user.id)).toEqual([])
    })

    it('updates Channel3D visibility when only vertical position changes cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel3D(instance.localState, 50)

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
        channel.moveEntity(entity)
        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false)
        expect(channel.getVisibleCellKeys(user.id)).toEqual([])
    })

    it('spatially culls Channel3D messages vertically', () => {
        const context = createContext()
        const instance = new Instance(context)
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new Channel3D(instance.localState, 50)

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

        expect(firstClient.latestFrame?.messages).toEqual([])
        expect(firstClient.latestFrame!.requireChannel(channel.nid).messages).toEqual([{ ntype: NType.Message, text: 'near-3d' }])
        expect(secondClient.latestFrame?.messages).toEqual([])
    })

    it('diffs Channel2D entity updates without dirty hints', () => {
        const context = createGroupedContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

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

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        expect(clientNetwork.store.get(entity.nid)?.x).toBe(11)
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
        const channel = new Channel2D(instance.localState, 50)

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

    it('keeps Channel2D visible cell keys cached for movement between populated cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel2D(instance.localState, 100)

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
        channel.moveEntity(first)

        expect(channel.getVisibleCellKeys(user.id)).toBe(keys)
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0', '1:0'])
    })

    it('rebuilds Channel2D visible cell keys when movement changes occupied cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel2D(instance.localState, 100)

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
        channel.moveEntity(entity)

        expect(channel.getVisibleCellKeys(user.id)).toEqual(['1:0'])
    })

    it('spatially culls Channel2D messages instead of broadcasting them', () => {
        const context = createContext()
        const instance = new Instance(context)
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

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

        expect(firstClient.latestFrame?.messages).toEqual([])
        expect(firstClient.latestFrame!.requireChannel(channel.nid).messages).toEqual([{ ntype: NType.Message, text: 'near' }])
        expect(secondClient.latestFrame?.messages).toEqual([])
    })

    it('keeps same-cell Channel2D creates on the normal create path', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

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

        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).createEntities.map(entity => entity.nid)).toEqual([second.nid])
        expect(clientNetwork.store.get(second.nid)?.label).toBe('second')
    })

    it('creates newly attached Channel2D children when the parent cell is unchanged', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(10, 10, 5, 5))
        const parent = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'parent'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

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

        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).createEntities.map(entity => entity.nid)).toEqual([child.nid])
        expect(clientNetwork.store.get(parent.nid)?.label).toBe('parent')
        expect(clientNetwork.store.get(child.nid)?.label).toBe('child')
    })

    it('keeps same-cell Channel2D removes on the normal delete path', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

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

        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).deleteEntities).toEqual([firstNid])
        expect(clientNetwork.store.entities.has(firstNid)).toBe(false)
        expect(clientNetwork.store.get(second.nid)?.label).toBe('second')
    })

    it('updates Channel2D visibility correctly when an entity moves between cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const firstUser = createUser(instance)
        const secondUser = createUser(instance)
        secondUser.id = 2
        const firstClient = createClientNetwork(context)
        const secondClient = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

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
        channel.moveEntity(entity)
        instance.step()
        firstClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(firstUser)))
        firstClient.processNextFrame()
        secondClient.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(secondUser)))
        secondClient.processNextFrame()

        expect(firstClient.latestFrame!.requireChannel(channel.nid).deleteEntities).toEqual([nid])
        expect(firstClient.store.entities.has(nid)).toBe(false)
        expect(secondClient.latestFrame!.requireChannel(channel.nid).createEntities.map(created => created.nid)).toEqual([nid])
        expect(secondClient.store.get(nid)?.x).toBe(60)
    })

    it('keeps ownership when a visible entity and subscriber view move to the same new cell', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(10, 10, 5, 5))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'moving-with-view'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const nid = entity.nid
        entity.x = 60
        channel.moveEntity(entity)
        channel.updateView(user, new AABB2D(60, 10, 5, 5))
        instance.step()

        expect(() => clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))).not.toThrow()
        expect(() => clientNetwork.processNextFrame()).not.toThrow()
        const frameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(frameChannel.deleteEntities).not.toContain(nid)
        expect(clientNetwork.store.get(nid)?.x).toBe(60)
        expect(clientNetwork.store.getEntityChannelId(nid)).toBe(channel.nid)
    })

    it('applies queued spatial movement snapshots after the subscriber view crosses cells', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

        instance.users.set(user.id, user)
        channel.subscribe(user, new AABB2D(10, 10, 5, 5))
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'queued-mover'
        })

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        const send = user.networkAdapter.send as jest.Mock
        send.mockClear()

        const positions = [60, 110, 160, 210, 260]
        positions.forEach(x => {
            entity.x = x
            channel.moveEntity(entity)
            channel.updateView(user, new AABB2D(x, 10, 5, 5))
            instance.step()
        })

        const buffers = send.mock.calls.map(call => call[1] as Buffer)
        expect(buffers).toHaveLength(positions.length)
        expect(() => {
            buffers.forEach(buffer => {
                clientNetwork.readSnapshot(testBinaryAdapter.createReader(buffer))
            })
            clientNetwork.drainFrames()
        }).not.toThrow()
        expect(clientNetwork.store.get(entity.nid)?.x).toBe(positions[positions.length - 1])
        expect(clientNetwork.store.getEntityChannelId(entity.nid)).toBe(channel.nid)
    })

    it('orders Channel2D leave-cell tree deletes from child to parent', () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.network.sharedUpdateFragmentsEnabled = true
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const channel = new Channel2D(instance.localState, 50)

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

        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).deleteEntities).toEqual([childNid, parentNid])
        expect(clientNetwork.store.entities.has(parentNid)).toBe(false)
        expect(clientNetwork.store.entities.has(childNid)).toBe(false)
    })

    it('reruns snapshot writes with binary diagnostic context after a write failure', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new Channel(instance.localState)
        instance.network.diagnosticBinaryWrites = true

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
            expect(err).toBeInstanceOf(BinaryDiagnosticError)
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

    it('reruns ECS component snapshot writes with binary diagnostic context after a write failure', () => {
        const context = createEcsContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const channel = new EcsChannel(instance.localState)
        instance.network.diagnosticBinaryWrites = true

        channel.subscribe(user)
        const pid = channel.createEntity()
        channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: Symbol('bad'),
            y: 6
        } as any)

        try {
            createSnapshotBuffer(user, instance)
            throw new Error('Expected ECS snapshot write to fail.')
        } catch (err: any) {
            expect(err).toBeInstanceOf(BinaryDiagnosticError)
            expect(err.context).toEqual(expect.objectContaining({
                phase: 'write',
                section: 'EcsCreateComponents',
                index: 0,
                prop: 'x',
                propKey: 0,
                binaryType: Binary.Float64
            }))
            expect(err.message).toContain('EcsCreateComponents')
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

        createSnapshotBuffer(user, instance)
        expect(user.responseQueue).toHaveLength(1)
        expect(user.responseQueue[0].requestId).toBe(256)

        createSnapshotBuffer(user, instance)
        expect(user.responseQueue).toHaveLength(0)
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
        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).createEntities).toHaveLength(256)
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
        user.queueInterpolatedMessage({ ntype: NType.Message, text: 'shot' })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        const createBuffer = createSnapshotBuffer(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createBuffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.messages).toEqual([
            { ntype: NType.Message, text: 'created' }
        ])
        expect(clientNetwork.latestFrame?.interpolatedMessages).toEqual([
            { ntype: NType.Message, text: 'shot' }
        ])
        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).createEntities).toEqual([
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

        const updateFrameChannel = clientNetwork.latestFrame!.requireChannel(channel.nid)
        expect(updateFrameChannel.createEntities).toEqual([])
        expect(updateFrameChannel.updateEntities).toEqual([
            { nid, prop: 'x', previous: 5, value: 11 }
        ])
        expect(clientNetwork.store.get(nid)?.x).toBe(11)

        channel.removeEntity(entity)
        instance.tick = 3
        instance.cache.createCachesForTick(instance.tick)
        const deleteBuffer = createSnapshotBuffer(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(deleteBuffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).deleteEntities).toEqual([nid])
        expect(clientNetwork.store.entities.has(nid)).toBe(false)
        expect(clientNetwork.entityNTypes.has(nid)).toBe(false)
    })

    it('sends channel headers before normal channel entities and applies header updates', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const header = {
            nid: 0,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'inventory'
        }
        const channel = new Channel(instance.localState, { header })
        const clientNetwork = createClientNetwork(context)

        channel.subscribe(user)
        const item = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'item'
        })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        const createBuffer = createSnapshotBuffer(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createBuffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.channelOpens).toEqual([
            {
                channelId: channel.nid,
                header: channel.header
            }
        ])
        expect(clientNetwork.latestFrame!.requireChannel(channel.nid).createEntities).toEqual([
            { nid: item.nid, ntype: NType.Entity, x: 5, y: 6, label: 'item' }
        ])
        expect(clientNetwork.store.getChannelHeader(channel.nid)).toEqual(channel.header)

        header.label = 'renamed'
        channel.syncHeader()
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        const updateBuffer = createSnapshotBuffer(user, instance) as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(updateBuffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.channelHeaderUpdates).toHaveLength(1)
        expect(clientNetwork.store.getChannelHeader(channel.nid)?.label).toBe('renamed')
    })

    it('sends a newly subscribed headered channel alongside an existing world channel', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const world = new Channel(instance.localState, { name: 'world' })
        const inventoryHeader = {
            nid: 0,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'inventory'
        }
        const inventory = new Channel(instance.localState, {
            header: inventoryHeader
        })
        world.subscribe(user)
        const player = world.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'player'
        })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))
        clientNetwork.processNextFrame()
        expect(clientNetwork.store.get(player.nid)).toBeDefined()
        expect(clientNetwork.store.getChannelHeader(world.nid)?.name).toBe('world')

        inventory.subscribe(user)
        const item = inventory.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'item'
        })

        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.channelOpens.map(open => open.channelId)).toEqual([inventory.nid])
        expect(clientNetwork.latestFrame!.requireChannel(inventory.nid).createEntities).toEqual([
            { nid: item.nid, ntype: NType.Entity, x: 5, y: 6, label: 'item' }
        ])
        expect(clientNetwork.store.getChannelHeader(item.nid)).toEqual(inventory.header)
    })

    it('closes a known headered channel without sending each contained entity delete', () => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const header = {
            nid: 0,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'inventory'
        }
        const channel = new Channel(instance.localState, { header })

        channel.subscribe(user)
        const item = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'item'
        })

        instance.tick = 1
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))
        clientNetwork.processNextFrame()
        expect(clientNetwork.store.get(item.nid)).toBeDefined()

        const itemNid = item.nid
        channel.unsubscribe(user)
        instance.tick = 2
        instance.cache.createCachesForTick(instance.tick)
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(user, instance) as Buffer))
        clientNetwork.processNextFrame()

        expect(clientNetwork.latestFrame?.channelCloses).toEqual([
            {
                channelId: channel.nid
            }
        ])
        expect(clientNetwork.latestFrame?.closedChannels).toEqual([
            {
                channelId: channel.nid,
                header: channel.header,
                entityNids: [itemNid]
            }
        ])
        expect(clientNetwork.store.get(itemNid)).toBeUndefined()
        expect(clientNetwork.store.getChannelHeader(channel.nid)).toBeUndefined()
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
        expect(frames[0].requireChannel(channel.nid).createEntities).toHaveLength(1)
        expect(frames[1].requireChannel(channel.nid).updateEntities).toEqual([
            { nid: entity.nid, prop: 'x', previous: 1, value: 3 }
        ])
        expect(clientNetwork.drainFrames()).toEqual([])
        expect(clientNetwork.store.get(entity.nid)?.x).toBe(3)
    })
})
