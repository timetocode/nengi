// Copied into the isolated consumer by test-package-family.mjs so every import
// below uses the freshly installed package artifacts.
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Binary, Channel, Client, Context, Instance, NetworkEvent, defineEntitySchema, defineMessageSchema } = require('nengi')
const { WsClientAdapter } = require('nengi-ws-client-adapter')
const { WebSocketClientAdapter } = require('nengi-websocket-client-adapter')
const { WsInstanceAdapter } = require('nengi-ws-instance-adapter')
const { UwsInstanceAdapter } = require('nengi-uws-instance-adapter')

async function waitUntil(check) {
    const deadline = performance.now() + 1500
    while (!check()) {
        if (performance.now() >= deadline) throw new Error('Transport delivery timed out')
        await new Promise(resolve => setTimeout(resolve, 5))
    }
}

for (const [kind, ClientAdapter] of [
    ['ws', WsClientAdapter], ['uws', WsClientAdapter],
    ['ws', WebSocketClientAdapter], ['uws', WebSocketClientAdapter]
]) {
    test(`${kind}/${ClientAdapter.name}: admission, commands and snapshots through installed packages`, { timeout: 5000 }, async t => {
        const context = new Context()
        context.register(1, defineEntitySchema({ value: Binary.Int32 }))
        context.register(2, defineMessageSchema({ value: Binary.Int32 }))
        const instance = new Instance(context)
        const failure = new Error('private authentication database details')
        const publicDetail = { reason: 'banned', until: 123 }
        const serverData = { accountId: 7 }
        let signal
        instance.onConnect = async ({ mode }, attempt) => {
            signal = attempt.signal
            if (mode === 'private') throw failure
            if (mode === 'deny') return { deny: publicDetail }
            if (mode === 'invalid') return { deny: BigInt(1) }
            if (mode === 'false') return false
            return { serverData, clientData: { ready: true } }
        }
        const Adapter = kind === 'ws' ? WsInstanceAdapter : UwsInstanceAdapter
        const adapter = new Adapter(instance.adapterHost)
        const client = new Client(instance.context, ClientAdapter, 20)
        t.after(async () => {
            client.disconnect()
            await adapter.shutdown()
        })
        await new Promise(resolve => adapter.listen({ port: 0, host: '127.0.0.1' }, resolve))
        const port = kind === 'ws'
            ? adapter.server.address().port
            : require('uWebSockets.js').us_socket_local_port(adapter.token)
        const address = `ws://127.0.0.1:${port}`
        for (const [mode, detail] of [
            ['private', { reason: 'server_error' }],
            ['deny', publicDetail],
            ['invalid', { reason: 'server_error' }],
            ['false', { reason: 'connection_denied' }]
        ]) {
            await assert.rejects(client.connect(address, { mode }), { code: 'CONNECTION_DENIED', detail })
            const event = instance.queue.next()
            assert.equal(event.type, NetworkEvent.UserConnectionDenied)
            assert.equal(signal.aborted, true)
            assert.equal(signal.reason, event.payload)
            if (mode === 'private') assert.equal(event.payload, failure)
            if (mode === 'deny') assert.equal(event.payload, publicDetail)
            assert.equal(instance.network.getPendingConnectionCount(), 0)
            assert.equal(instance.users.size, 0)
        }
        assert.deepEqual(await client.connect(address, { mode: 'accept' }), { ready: true })
        const connected = instance.queue.next()
        assert.equal(connected.type, NetworkEvent.UserConnected)
        assert.equal(connected.payload, serverData)
        assert.equal(signal.aborted, false)

        const channel = new Channel(instance.localState)
        channel.subscribe(connected.user)
        const entity = channel.addEntity({ nid: 0, ntype: 1, value: 42 })
        instance.step()
        await waitUntil(() => client.network.drainFrames().length > 0)
        assert.equal(client.network.store.get(entity.nid).value, 42)
        client.addCommand({ ntype: 2, value: 7 })
        client.flush()
        await waitUntil(() => !instance.queue.isEmpty())
        const command = instance.queue.next()
        assert.equal(command.type, NetworkEvent.CommandSet)
        assert.equal(command.commands[0].value, 7)
        entity.value = 43
        instance.step()
        await waitUntil(() => client.network.drainFrames().length > 0)
        assert.equal(client.network.store.get(entity.nid).value, 43)

        // Force a flush after native CLOSED but before the adapter observes its
        // real close event. Both native WebSocket and ws must retain the reason.
        const socket = client.adapter.socket
        let raced = false
        const flushBeforeClose = () => {
            assert.equal(socket.readyState, 3)
            raced = true
            client.flush()
        }
        if (ClientAdapter === WsClientAdapter) {
            socket.prependOnceListener('close', flushBeforeClose)
        } else {
            const onclose = socket.onclose
            socket.onclose = event => {
                flushBeforeClose()
                onclose(event)
            }
        }
        let disconnected
        client.setDisconnectHandler(info => { disconnected = info })
        const rejected = assert.rejects(client.request(1, {}, { timeoutMs: 0 }), { code: 'DISCONNECTED' })
        connected.user.disconnect({ reason: 'participant_in_use' })
        await waitUntil(() => disconnected)
        assert.equal(raced, true)
        assert.equal(disconnected.code, 'REMOTE_CLOSE')
        assert.equal(disconnected.detail.code, 1000)
        assert.equal(disconnected.detail.reason, '{"reason":"participant_in_use"}')
        await rejected
    })
}

test('incompatible contracts fail at setup without admitting a connection', () => {
    const instance = new Instance(new Context())
    class IncompatibleClient extends WsClientAdapter {
        clientAdapterVersion = 1
    }
    assert.throws(() => new Client(instance.context, IncompatibleClient, 20), /version 2/)
    for (const Adapter of [WsInstanceAdapter, UwsInstanceAdapter]) {
        assert.throws(() => new Adapter({ serverAdapterVersion: 0 }), /contract version 1/)
    }
    assert.throws(() => instance.adapterHost.createConnection(null, { serverAdapterVersion: 0 }), /contract version 1/)
    assert.equal(instance.network.getPendingConnectionCount(), 0)
    assert.equal(instance.users.size, 0)
})
