import { Binary } from '../common/binary/Binary'
import { Context } from '../common/Context'
import { defineEntitySchema, defineMessageSchema } from '../common/binary/schema/defineSchema'
import { BinaryDiagnosticError } from '../binary/BinaryDiagnosticError'
import { TestBufferWriter, testBinaryAdapter } from '../testSupport/BufferBinary'
import { Instance, InstanceStepError } from './Instance'
import { User, UserConnectionState } from './User'
import { Channel } from './channel/Channel'
import { Channel2D } from './channel/Channel2D'
import { Channel3D } from './channel/Channel3D'
import { ManualChannel } from './channel/ManualChannel'
import { ManualChannel2D } from './channel/ManualChannel2D'
import { ManualChannel3D } from './channel/ManualChannel3D'
import { EcsChannel } from './channel/EcsChannel'
import { EcsChannel2D } from './channel/EcsChannel2D'
import { EcsChannel3D } from './channel/EcsChannel3D'
import { AABB2D } from './channel/AABB2D'
import { AABB3D } from './channel/AABB3D'
import { Client } from '../client/Client'
import { LocalClientAdapter, LocalInstanceAdapter } from './adapter/MockAdapter'

function setup() {
    const context = new Context()
    const schema = defineEntitySchema({ x: Binary.Float64, y: Binary.Float64, z: Binary.Float64, label: Binary.String })
    context.register(1, schema)
    context.register(2, defineMessageSchema({ text: Binary.String }))
    const instance = new Instance(context, { now: () => 1000 })
    const adapter = {
        serverAdapterVersion: 1 as const,
        binary: { ...testBinaryAdapter },
        send: jest.fn(),
        disconnect: jest.fn(),
        shutdown: jest.fn().mockResolvedValue(undefined),
        listen: jest.fn()
    }
    const user = new User(null, adapter)
    user.instance = instance
    user.id = 1
    user.connectionState = UserConnectionState.Open
    instance.connectedUsers.set(user.id, user)
    return { instance, adapter, user, schema }
}

function brokenStringWriter(bytes: number) {
    const writer = TestBufferWriter.create(bytes)
    const writeString = writer.writeString.bind(writer)
    writer.writeString = value => {
        if (value === 'broken') {
            // Leave one byte unwritten, reproducing a count/encoding disagreement.
            writer.writeUInt32(value.length)
            writer.writeBytes(new TextEncoder().encode(value.slice(0, -1)))
        } else {
            writeString(value)
        }
    }
    return writer
}

const channelTypes = [Channel, Channel2D, Channel3D, ManualChannel, ManualChannel2D, ManualChannel3D,
    EcsChannel, EcsChannel2D, EcsChannel3D]

describe.each([false, true])('terminal snapshot failures, shared updates %s', shared => {
    test.each(channelTypes.map(Type => [Type.name, Type] as const))('%s refuses a malformed update and cannot resume', (_name, Type) => {
        const { instance, adapter, user, schema } = setup()
        instance.network.sharedUpdateFragmentsEnabled = shared
        const channel: any = new (Type as any)(instance.localState, 50)
        const ecs = Type.name.startsWith('Ecs')
        const view = Type.name.endsWith('3D') ? new AABB3D(10, 10, 10, 5, 5, 5) : new AABB2D(10, 10, 5, 5)
        channel.subscribe(user, view)
        const data = { nid: 0, ntype: 1, x: 10, y: 10, z: 10, label: 'valid' }
        const entity = ecs
            ? (Type === EcsChannel ? channel.addComponent(channel.createEntity(), data) : channel.addSpatialComponent(channel.createEntity(), data))
            : channel.addEntity(data)
        const writes = ecs ? channel.createComponentWriter(1, schema) : channel.createEntityWriter?.(1, schema)
        instance.step()
        adapter.send.mockClear()

        adapter.binary.createWriter = brokenStringWriter
        entity.label = 'broken'
        entity.x = 11
        writes?.props.label(entity, entity.label)
        writes?.props.x(entity, entity.x)
        expect(() => instance.step()).toThrow(InstanceStepError)
        const failure = instance.failure!
        expect(failure.cause).toBeInstanceOf(BinaryDiagnosticError)
        const context = (failure.cause as BinaryDiagnosticError).context
        expect(context.offset).toBe(context.expectedBytes! - 1)
        expect(adapter.send).not.toHaveBeenCalled()
        expect(instance.network.sharedUpdateFragments.size).toBe(0)

        entity.label = 'repaired'
        adapter.binary.createWriter = testBinaryAdapter.createWriter
        const tick = instance.tick
        expect(() => instance.step()).toThrow(failure)
        expect(instance.failure).toBe(failure)
        expect(instance.tick).toBe(tick)
        expect(adapter.send).not.toHaveBeenCalled()
    })
})

test('a malformed shared create is rejected before caching or fanout', () => {
    const { instance, adapter, user } = setup()
    const channel = new Channel(instance.localState)
    channel.subscribe(user)
    instance.network.sharedUpdateFragmentsEnabled = true
    instance.step()
    adapter.send.mockClear()
    channel.addEntity({ nid: 0, ntype: 1, x: 10, y: 10, z: 10, label: 'broken' })
    adapter.binary.createWriter = brokenStringWriter
    expect(() => instance.step()).toThrow(InstanceStepError)
    expect((instance.failure!.cause as BinaryDiagnosticError).context.section).toBe('Shared entity creates')
    expect(instance.network.sharedCreateFragments.size).toBe(0)
    expect(adapter.send).not.toHaveBeenCalled()
})

test('a malformed broadcast is rejected before caching or sending', () => {
    const { instance, adapter, user } = setup()
    const channel = new Channel(instance.localState)
    channel.subscribe(user)
    instance.step()
    adapter.send.mockClear()
    channel.addMessage({ ntype: 2, text: 'broken' })
    adapter.binary.createWriter = brokenStringWriter
    expect(() => instance.step()).toThrow(InstanceStepError)
    expect((instance.failure!.cause as BinaryDiagnosticError).context.section).toBe('Shared messages')
    expect(instance.network.sharedMessageFragments.size).toBe(0)
    expect(adapter.send).not.toHaveBeenCalled()
})

test('preflight clock failure is retryable', () => {
    let now = NaN
    const instance = new Instance(new Context(), { now: () => now })
    const tick = instance.tick
    expect(() => instance.step()).toThrow('finite monotonic server time')
    expect(instance.failure).toBeNull()
    expect(instance.tick).toBe(tick)
    now = 1000
    expect(() => instance.step()).not.toThrow()
})

test('an unprintable thrown value is retained without breaking failure handling', () => {
    const { instance, adapter } = setup()
    const cause = { toString() { throw new Error('Cannot format this value') } }
    adapter.binary.createWriter = () => { throw cause }
    expect(() => instance.step()).toThrow(InstanceStepError)
    expect(instance.failure!.cause).toBe(cause)
    expect(() => instance.step()).toThrow(instance.failure!)
})

test('cleanup failures are terminal and do not hide an earlier write error', () => {
    const { instance, adapter, user } = setup()
    const channel = new Channel(instance.localState)
    channel.subscribe(user)
    const writeError = new Error('encoder failed')
    const cleanupError = new Error('cleanup failed')
    adapter.binary.createWriter = () => { throw writeError }
    jest.spyOn(channel, 'clearSnapshotDeltas').mockImplementation(() => { throw cleanupError })
    expect(() => instance.step()).toThrow(InstanceStepError)
    expect(instance.failure!.cause).toBe(writeError)

    const other = new Instance(new Context())
    jest.spyOn(other.localState, 'releaseDeferredIds').mockImplementation(() => { throw cleanupError })
    expect(() => other.step()).toThrow(InstanceStepError)
    expect(other.failure!.cause).toBe(cleanupError)
})

test('a transport send error closes only that user and later users still receive snapshots', () => {
    const { instance, adapter, user } = setup()
    const other = new User(null, adapter)
    other.instance = instance
    other.id = 2
    other.connectionState = UserConnectionState.Open
    instance.connectedUsers.set(other.id, other)
    const error = new Error('socket failed')
    adapter.send.mockImplementationOnce(() => { throw error })
    instance.onSnapshotSendError = jest.fn()
    expect(() => instance.step()).not.toThrow()
    expect(instance.failure).toBeNull()
    expect(user.connectionState).toBe(UserConnectionState.Closed)
    expect(other.lastSentInstanceTick).toBe(instance.tick)
    expect(instance.onSnapshotSendError).toHaveBeenCalledWith(expect.objectContaining({ user, error }))
    expect(() => instance.step()).not.toThrow()
})

test('a later user failing cannot roll back earlier sends or permit a retry', () => {
    const { instance, adapter, user } = setup()
    const other = new User(null, adapter)
    other.instance = instance
    other.id = 2
    other.connectionState = UserConnectionState.Open
    instance.connectedUsers.set(other.id, other)
    instance.step()
    adapter.send.mockClear()
    const previousTick = instance.tick
    other.queueMessage({ ntype: 2, text: 'broken' })
    adapter.binary.createWriter = brokenStringWriter
    expect(() => instance.step()).toThrow(InstanceStepError)
    expect(adapter.send).toHaveBeenCalledTimes(1)
    expect(user.lastSentInstanceTick).toBe(instance.tick)
    expect(other.lastSentInstanceTick).toBe(previousTick)
    adapter.binary.createWriter = testBinaryAdapter.createWriter
    expect(() => instance.step()).toThrow(instance.failure!)
    expect(adapter.send).toHaveBeenCalledTimes(1)
    expect(() => new Instance(new Context()).step()).not.toThrow()
})

test('failed automatic diffing cannot pretend to recover, and ordinary shutdown still cleans up', async () => {
    const { instance } = setup()
    instance.connectedUsers.clear()
    instance.onConnect = async () => true
    const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary: testBinaryAdapter })
    const clients = [0, 1].map(() => new Client(instance.context, LocalClientAdapter, 20, { binary: testBinaryAdapter }))
    const closed = jest.fn()
    const channel = new Channel(instance.localState)
    const entity = channel.addEntity({ nid: 0, ntype: 1, x: 1, y: 0, z: 0, label: 'valid' })
    try {
        for (const client of clients) {
            client.setDisconnectHandler(closed)
            await client.connect(adapter.createMockConnect().clientSocket)
        }
        for (const user of instance.users.values()) channel.subscribe(user)
        instance.step()
        for (const client of clients) {
            client.network.processNextFrame()
            expect(client.network.store.get(entity.nid)!.x).toBe(1)
        }
        entity.x = 2
        entity.label = 42 as any
        expect(() => instance.step()).toThrow(InstanceStepError)
        entity.label = 'repaired'
        expect(() => instance.step()).toThrow(instance.failure!)
        expect(closed).not.toHaveBeenCalled()
        await adapter.shutdown('Snapshot failure')
        expect(instance.users.size).toBe(0)
        expect(closed).toHaveBeenCalledTimes(2)
    } finally {
        await adapter.shutdown()
    }
})
