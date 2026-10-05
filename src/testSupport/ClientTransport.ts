import { Client, ClientOptions } from '../client/Client'
import { ClientTransportHandlers } from '../client/adapter/IClientNetworkAdapter'
import { Context } from '../common/Context'
import { BinarySection } from '../common/binary/BinarySection'
import { WIRE_PROTOCOL_VERSION } from '../common/binary/Protocol'
import { EngineMessage } from '../common/EngineMessage'
import { testBinaryAdapter } from './BufferBinary'
import { writeSnapshotHeader } from '../binary/snapshot/snapshotHeader'

export function acceptance(clientData?: unknown) {
    const json = clientData === undefined ? '' : JSON.stringify(clientData)
    const writer = testBinaryAdapter.createWriter(9 + Buffer.byteLength(json))
    writer.writeUInt8(BinarySection.EngineMessages)
    writer.writeUInt8(1)
    writer.writeUInt8(EngineMessage.ConnectionAccepted)
    writer.writeUInt16(WIRE_PROTOCOL_VERSION)
    writer.writeString(json)
    return writer.payload
}

export function heartbeat() {
    const writer = testBinaryAdapter.createWriter(10)
    writeSnapshotHeader(0, writer)
    return writer.payload
}

/** Manually deliver socket events, including deliberately stale ones. */
export class TestClientTransport {
    readonly clientAdapterVersion = 2 as const
    binary = testBinaryAdapter
    attempts: ClientTransportHandlers<Buffer>[] = []
    send = jest.fn()
    close = jest.fn()

    open(_target: unknown, handlers: ClientTransportHandlers<Buffer>) {
        this.attempts.push(handlers)
    }

    accept() {
        const handlers = this.attempts[this.attempts.length - 1]
        handlers.onOpen()
        handlers.onMessage(acceptance())
    }
}

export function connectedTestClient(context: Context, options: ClientOptions = {}) {
    const client = new Client(context, TestClientTransport, 20, undefined, {
        connectTimeoutMs: null, serverTimeoutMs: null, ...options
    })
    void client.connect(undefined)
    client.adapter.accept()
    return client
}
