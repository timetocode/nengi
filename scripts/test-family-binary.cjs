// Runs from the isolated consumer so both binary backends use the current core.
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
    Binary, binaryGet, Channel, Client, Context, Instance, NetworkEvent,
    LocalClientAdapter, LocalInstanceAdapter, defineEntitySchema, defineMessageSchema
} = require('nengi')
const { bufferBinary } = require('nengi-buffers')
const { dataViewBinary } = require('nengi-dataviews')

const strings = [
    '', 'plain text', 'café', '旅人', 'ok🪁', '\ud800', '\udc00', 'ok\ud83d',
    '\ud800\ud800', '\ud800é', '\ud800旅', '\ud800\udbff\udfff',
    '\ufeffhello', '\ufeff', '\ufeff\ufeffhello', 'x\ufeffhello'
]
const utf8Value = value => Buffer.from(value, 'utf8').toString('utf8')

for (const [name, writerBackend, readerBackend] of [
    ['Buffer → DataView', bufferBinary, dataViewBinary],
    ['DataView → Buffer', dataViewBinary, bufferBinary]
]) {
    test(`${name}: String sizes and consecutive field contents agree`, () => {
        const spec = binaryGet(Binary.String)
        const bytes = strings.reduce((sum, value) => sum + spec.byteSize(value), 0) + 2
        const writer = writerBackend.createWriter(bytes)
        for (const value of strings) {
            const start = writer.offset
            spec.write(value, writer)
            assert.equal(writer.offset - start, spec.byteSize(value), JSON.stringify(value))
        }
        writer.writeUInt16(0x1234)
        assert.equal(writer.offset, bytes)
        // Real Node socket adapters likewise normalize incoming ArrayBuffers.
        const payload = readerBackend === bufferBinary ? Buffer.from(writer.payload) : writer.payload
        const reader = readerBackend.createReader(payload)
        for (const value of strings) {
            assert.equal(spec.read(reader), utf8Value(value), JSON.stringify(value))
        }
        assert.equal(reader.readUInt16(), 0x1234)
        assert.equal(reader.offset, bytes)
    })
}

for (const [name, binary] of [['Buffer', bufferBinary], ['DataView', dataViewBinary]]) {
    for (const shared of [false, true]) {
        test(`${name}: Unicode creates, updates, messages and commands (shared fragments: ${shared})`, async t => {
            const context = new Context()
            context.register(1, defineEntitySchema({ text: Binary.String }))
            context.register(2, defineMessageSchema({ text: Binary.String }))
            let now = 0
            const instance = new Instance(context, { now: () => now })
            instance.onConnect = async () => true
            instance.network.sharedUpdateFragmentsEnabled = shared
            const channel = new Channel(instance.localState)
            const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary })
            const clients = []
            t.after(async () => {
                for (const client of clients) client.disconnect()
                await adapter.shutdown()
            })
            for (let i = 0; i < 2; i++) {
                const client = new Client(context, LocalClientAdapter, 20, { binary }, { serverTimeoutMs: null })
                clients.push(client)
                await client.connect(adapter.createMockConnect().clientSocket)
            }
            while (!instance.queue.isEmpty()) {
                const event = instance.queue.next()
                assert.equal(event.type, NetworkEvent.UserConnected)
                channel.subscribe(event.user)
            }

            const entity = channel.addEntity({ nid: 0, ntype: 1, text: 'ok\ud83d' })
            for (const value of [entity.text, ...strings]) {
                entity.text = value
                channel.addMessage({ ntype: 2, text: value })
                now += 50
                instance.step()
                for (const client of clients) {
                    assert.equal(client.connectionState, 'connected')
                    const frames = client.network.drainFrames()
                    assert.equal(frames.length, 1)
                    assert.equal(client.network.store.get(entity.nid).text, utf8Value(value))
                    assert.equal(frames[0].requireChannel(channel.nid).messages[0].text, utf8Value(value))
                    client.addCommand({ ntype: 2, text: value })
                    client.flush()
                }
                let received = 0
                while (!instance.queue.isEmpty()) {
                    const event = instance.queue.next()
                    assert.equal(event.type, NetworkEvent.CommandSet)
                    assert.equal(event.commands.length, 1)
                    assert.equal(event.commands[0].text, utf8Value(value))
                    received++
                }
                assert.equal(received, clients.length)
            }
        })
    }
}
