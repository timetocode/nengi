import { assertBinaryWriteSize } from './assertBinaryWriteSize'
import { BinaryDiagnosticError } from './BinaryDiagnosticError'
import { TestBufferWriter, testBinaryAdapter } from '../testSupport/BufferBinary'
import { connectedTestClient } from '../testSupport/ClientTransport'
import { Context } from '../common/Context'
import { Binary } from '../common/binary/Binary'
import { defineMessageSchema } from '../common/binary/schema/defineSchema'
import { Instance } from '../server/Instance'
import { Client } from '../client/Client'
import { LocalClientAdapter, LocalInstanceAdapter } from '../server/adapter/MockAdapter'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import createSnapshotBuffer from './snapshot/createSnapshotBuffer'
import { User } from '../server/User'
import { EngineMessage } from '../common/EngineMessage'

test.each([
    { bytes: 8, offset: 7 },
    { bytes: 8, offset: 9 },
    { bytes: 9, offset: 8 },
    { bytes: 7, offset: 8 },
    { bytes: 8, offset: undefined }
])('rejects a mismatched or incomplete writer: %j', ({ bytes, offset }) => {
    const writer = TestBufferWriter.create(bytes)
    writer.offset = offset as number
    try {
        assertBinaryWriteSize(writer, 8, 'Test allocation')
        throw new Error('Expected guard failure')
    } catch (error: any) {
        expect(error).toBeInstanceOf(BinaryDiagnosticError)
        expect(error.context).toEqual({
            phase: 'write', section: 'Test allocation', expectedBytes: 8, offset, payloadBytes: bytes
        })
    }
})

test('accepts an empty payload and a complete payload backed by a larger allocation', () => {
    expect(() => assertBinaryWriteSize(TestBufferWriter.create(0), 0, 'Empty')).not.toThrow()
    const writer = new TestBufferWriter(Buffer.alloc(32).subarray(8, 16))
    writer.writeFloat64(123)
    expect(() => assertBinaryWriteSize(writer, 8, 'Subview')).not.toThrow()
})

test('a client encoding mismatch does not send or consume queued commands', () => {
    const context = new Context()
    context.register(1, defineMessageSchema({ x: Binary.Float64 }))
    const client = connectedTestClient(context)
    client.adapter.binary = {
        ...testBinaryAdapter,
        createWriter: bytes => TestBufferWriter.create(bytes + 1)
    }
    client.adapter.send.mockClear()
    const command = { ntype: 1, x: 12 }
    client.addCommand(command)
    const frame = client.network.commandFrameNumber
    expect(() => client.flush()).toThrow(BinaryDiagnosticError)
    expect(client.adapter.send).not.toHaveBeenCalled()
    expect(client.network.commandFrameNumber).toBe(frame)
    expect(client.network.outbound.getCurrentFrame().outboundCommands).toEqual([command])

    client.adapter.binary = testBinaryAdapter
    expect(() => client.flush()).not.toThrow()
    expect(client.adapter.send).toHaveBeenCalledTimes(1)
    client.disconnect()
})

test('a malformed Pong payload is not sent or removed from the control queue', () => {
    const client = connectedTestClient(new Context())
    const network = client.network
    const instance = new Instance(client.context, { now: () => 100 })
    const user = new User(null, { binary: testBinaryAdapter } as any)
    const snapshot = createSnapshotBuffer(user, instance, 100, {
        ntype: EngineMessage.Ping, pingId: 7, latency: 0, serverTimeMs: 100
    })
    network.readSnapshot(testBinaryAdapter.createReader(snapshot as Buffer))
    const send = jest.fn()
    const binary = { ...testBinaryAdapter, createWriter: (bytes: number) => TestBufferWriter.create(bytes + 1) }
    expect(() => network.flushPongs(binary, send)).toThrow(BinaryDiagnosticError)
    expect(send).not.toHaveBeenCalled()
    expect(network.flushPongs(testBinaryAdapter, send)).toBe(1)
    expect(network.flushPongs(testBinaryAdapter, send)).toBe(0)
    expect(send).toHaveBeenCalledTimes(1)
    client.disconnect()
})

test('a malformed acceptance payload never accepts the client or fails the instance', async () => {
    const instance = new Instance(new Context())
    instance.onConnect = async () => true
    const binary = { ...testBinaryAdapter, createWriter: (bytes: number) => TestBufferWriter.create(bytes + 1) }
    const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary })
    const client = new Client(instance.context, LocalClientAdapter, 20, { binary: testBinaryAdapter })
    try {
        await expect(client.connect(adapter.createMockConnect().clientSocket)).rejects.toMatchObject({ code: 'REMOTE_CLOSE' })
        expect(instance.users.size).toBe(0)
        expect(instance.failure).toBeNull()
        const event = instance.queue.next()
        expect(event.type).toBe(NetworkEvent.UserConnectionDenied)
        expect(event.payload).toBeInstanceOf(BinaryDiagnosticError)
        expect(event.payload.context.section).toBe('Connection accepted')
        expect(() => instance.step()).not.toThrow()
    } finally {
        await adapter.shutdown()
    }
})
