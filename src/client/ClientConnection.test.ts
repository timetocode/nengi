import { Binary } from '../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { ConnectionAcceptance, ConnectionDenial, Instance } from '../server/Instance'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { CommandRouter } from '../server/CommandRouter'
import { Channel } from '../server/channel/Channel'
import { LocalClientAdapter, LocalInstanceAdapter } from '../server/adapter/MockAdapter'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { Client } from './Client'

const pendingMessage = 'A connection attempt is already pending on this Client.'
const reuseMessage = 'This Client has already established a session. Create a new Client to connect again.'

function setup() {
    const context = new Context()
    context.register(1, defineEntitySchema({ x: Binary.Float32 }))
    context.register(2, defineMessageSchema({ dx: Binary.Float32 }))
    const instance = new Instance(context)
    instance.onConnect = async () => true
    const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary: testBinaryAdapter })
    const createClient = () => {
        const client = new Client(context, LocalClientAdapter, 20, { binary: testBinaryAdapter })
        const onDisconnect = jest.fn()
        client.setDisconnectHandler(onDisconnect)
        return Object.assign(client, { onDisconnect })
    }
    return { instance, adapter, createClient, client: createClient() }
}

describe('public connection denials', () => {
    it.each([null, false, 0, '', ['full'], { reason: 'banned', until: 123 }].map(value => [value]))(
        'preserves explicit JSON detail %j and permits retry', async detail => {
            const { instance, adapter, client } = setup()
            let signal!: AbortSignal
            const decision: ConnectionDenial = { deny: detail }
            instance.onConnect = async (_handshake, attempt) => {
                signal = attempt.signal
                return decision
            }
            try {
                await expect(client.connect(adapter.createMockConnect().clientSocket)).rejects.toMatchObject({
                    code: 'CONNECTION_DENIED', detail
                })
                const event = instance.queue.next()
                expect(event.type).toBe(NetworkEvent.UserConnectionDenied)
                expect(event.payload).toBe(detail)
                expect(signal.aborted).toBe(true)
                expect(signal.reason).toBe(detail)
                expect(instance.network.pendingUsers.size).toBe(0)
                expect(instance.users.size).toBe(0)
                expect(client.connectionState).toBe('idle')
                instance.onConnect = async () => true
                await expect(client.connect(adapter.createMockConnect().clientSocket)).resolves.toBeUndefined()
            } finally {
                await adapter.shutdown()
            }
        }
    )

    it.each([
        new Error('private database host and credentials'),
        { name: 'Error', message: 'private backend details', reason: 'banned' },
        'private exception text'
    ])('keeps thrown diagnostics server-local: %j', async failure => {
        const { instance, adapter, client } = setup()
        let signal!: AbortSignal
        instance.onConnect = async (_handshake, attempt) => {
            signal = attempt.signal
            throw failure
        }
        try {
            await expect(client.connect(adapter.createMockConnect().clientSocket)).rejects.toMatchObject({
                code: 'CONNECTION_DENIED', detail: { reason: 'server_error' }
            })
            expect(instance.queue.next().payload).toBe(failure)
            expect(signal.reason).toBe(failure)
            expect(signal.aborted).toBe(true)
            expect(instance.network.pendingUsers.size).toBe(0)
        } finally {
            await adapter.shutdown()
        }
    })

    it.each(['undefined', 'bigint', 'cycle', 'serializer', 'mixed', 'extra field'])(
        'hides invalid denial failures: %s', async kind => {
            const { instance, adapter, client } = setup()
            const failure = new Error('private serialization failure')
            const cycle: any = {}
            cycle.self = cycle
            const decisions: Record<string, any> = {
                undefined: { deny: undefined },
                bigint: { deny: BigInt(1) },
                cycle: { deny: cycle },
                serializer: { deny: { toJSON() { throw failure } } },
                mixed: { deny: 'no', clientData: 'yes' },
                'extra field': { deny: 'no', privateNote: 'secret' }
            }
            let signal!: AbortSignal
            instance.onConnect = async (_handshake, attempt) => {
                signal = attempt.signal
                return decisions[kind]
            }
            try {
                await expect(client.connect(adapter.createMockConnect().clientSocket)).rejects.toMatchObject({
                    code: 'CONNECTION_DENIED', detail: { reason: 'server_error' }
                })
                const event = instance.queue.next()
                expect(event.type).toBe(NetworkEvent.UserConnectionDenied)
                expect(event.payload).toBeInstanceOf(Error)
                expect(signal.reason).toBe(event.payload)
                if (kind === 'serializer') expect(event.payload).toBe(failure)
                expect(instance.network.pendingUsers.size).toBe(0)
                expect(instance.users.size).toBe(0)
            } finally {
                await adapter.shutdown()
            }
        }
    )

    it('keeps false as a generic public refusal', async () => {
        const { instance, adapter, client } = setup()
        instance.onConnect = async () => false
        try {
            await expect(client.connect(adapter.createMockConnect().clientSocket)).rejects.toMatchObject({
                code: 'CONNECTION_DENIED', detail: { reason: 'connection_denied' }
            })
            expect(instance.queue.next().payload).toBeInstanceOf(Error)
        } finally {
            await adapter.shutdown()
        }
    })
})

describe('Client connection lifetime', () => {
    it('rejects an overlapping attempt without replacing the original pending handshake', async () => {
        const { instance, adapter, client } = setup()
        let accept!: (value: boolean) => void
        const authorization = new Promise<boolean>(resolve => { accept = resolve })
        instance.onConnect = () => authorization
        const original = adapter.createMockConnect()
        const unused = adapter.createMockConnect()
        const connecting = client.connect(original.clientSocket)
        void connecting.catch(() => {})

        try {
            const duplicate = client.connect(unused.clientSocket)
            void duplicate.catch(() => {})
            expect(unused.clientSocket.adapter).toBeNull()
            await expect(duplicate).rejects.toThrow(pendingMessage)
            expect(client.adapter.socket).toBe(original.clientSocket)
            accept(true)
            await expect(connecting).resolves.toBeUndefined()
            expect(instance.users.size).toBe(1)
            expect(client.onDisconnect).not.toHaveBeenCalled()
        } finally {
            accept(true)
            original.end()
            unused.end()
        }
    })

    it('preserves a live session and requires a fresh Client after disconnect', async () => {
        const { instance, adapter, client, createClient } = setup()
        const original = adapter.createMockConnect()
        const unused = adapter.createMockConnect()
        try {
            await client.connect(original.clientSocket)
            const user = Array.from(instance.users.values())[0]
            const channel = new Channel(instance.localState)
            const entity = channel.addEntity({ nid: 0, ntype: 1, x: 5 })
            channel.subscribe(user)
            instance.step()
            client.network.processNextFrame()
            instance.respond(1, ({ body }) => ({ value: body.value }))
            const response = client.request(1, { value: 7 }, { timeoutMs: 0 })
            void response.catch(() => {})
            client.addCommand({ ntype: 2, dx: 3 })

            const duplicate = client.connect(unused.clientSocket)
            void duplicate.catch(() => {})
            expect(unused.clientSocket.adapter).toBeNull()
            await expect(duplicate).rejects.toThrow(reuseMessage)
            expect(client.adapter.socket).toBe(original.clientSocket)

            client.flush()
            const router = new CommandRouter().on(2, ({ command }) => { entity.x += command.dx })
            while (!instance.queue.isEmpty()) router.process(instance.queue.next())
            instance.processRequests()
            user.confirmCommandsThrough(user.lastReceivedCommandFrameNumber)
            instance.step()
            client.network.processNextFrame()
            await expect(response).resolves.toEqual({ value: 7 })
            expect(client.network.store.get(entity.nid)?.x).toBe(8)
            expect(client.onDisconnect).not.toHaveBeenCalled()

            client.disconnect('finished')
            await expect(client.connect(unused.clientSocket)).rejects.toThrow(reuseMessage)
            expect(unused.clientSocket.adapter).toBeNull()

            const replacement = createClient()
            expect(replacement.network.store.entities.size).toBe(0)
            await expect(replacement.connect(unused.clientSocket)).resolves.toBeUndefined()
            channel.subscribe(Array.from(instance.users.values())[0])
            instance.step()
            replacement.network.processNextFrame()
            expect(replacement.network.store.get(entity.nid)?.x).toBe(8)
        } finally {
            original.end()
            unused.end()
        }
    })

    it.each(['denied', 'closed', 'cancelled', 'invalid handshake'])('allows retry after a %s attempt', async outcome => {
        const { instance, adapter, client } = setup()
        const original = adapter.createMockConnect()
        const unused = adapter.createMockConnect()
        let accept: ((value: boolean) => void) | undefined
        if (outcome === 'denied') instance.onConnect = async () => false
        if (outcome === 'closed') original.end('unavailable')
        if (outcome === 'cancelled') {
            const authorization = new Promise<boolean>(resolve => { accept = resolve })
            instance.onConnect = () => authorization
        }

        try {
            const connecting = client.connect(original.clientSocket, outcome === 'invalid handshake' ? { value: BigInt(1) } : {})
            if (outcome === 'cancelled') client.disconnect('cancelled')
            await expect(connecting).rejects.toBeDefined()
            expect(client.adapter.socket).toBeNull()
            expect(client.connectionState).toBe('idle')
            expect(client.onDisconnect).not.toHaveBeenCalled()
            instance.onConnect = async () => true

            const retry = client.connect(unused.clientSocket)
            // Completion of old authorization must not admit its cancelled user.
            accept?.(true)
            await expect(retry).resolves.toBeUndefined()
            expect(instance.users.size).toBe(1)
            const user = Array.from(instance.users.values())[0]
            const channel = new Channel(instance.localState)
            const entity = channel.addEntity({ nid: 0, ntype: 1, x: 12 })
            channel.subscribe(user)
            instance.step()
            client.network.processNextFrame()
            expect(client.network.store.get(entity.nid)?.x).toBe(12)
            expect(client.adapter.socket).toBe(unused.clientSocket)
            expect(client.onDisconnect).not.toHaveBeenCalled()
        } finally {
            accept?.(true)
            original.end()
            unused.end()
        }
    })
})

describe('connection setup data', () => {
    it('waits for setup, keeps server objects local, and returns client data before the first snapshot', async () => {
        const { instance, adapter, client } = setup()
        const character = { name: '旅人 🪁', x: 12, databaseId: BigInt(7) }
        const serverData = {
            character,
            toJSON: jest.fn(() => { throw new Error('Server data must never be serialized') })
        }
        const clientData = { characterName: character.name, room: 'garden', options: { music: false }, slots: [1, 3] }
        let finish!: (result: ConnectionAcceptance) => void
        instance.onConnect = () => new Promise(resolve => { finish = resolve })
        const socket = adapter.createMockConnect()

        try {
            const connecting = client.connect<typeof clientData>(socket.clientSocket)
            expect(client.connectionState).toBe('connecting')
            expect(instance.users.size).toBe(0)
            expect(instance.queue.length).toBe(0)

            finish({ serverData, clientData })
            const received = await connecting
            expect(received).toEqual(clientData)
            expect(received).not.toBe(clientData)
            expect(received?.slots).not.toBe(clientData.slots)
            expect(serverData.toJSON).not.toHaveBeenCalled()
            expect(client.network.processNextFrame()).toBeNull()

            const event = instance.queue.next()
            expect(event.type).toBe(NetworkEvent.UserConnected)
            expect(event.payload).toBe(serverData)
            expect(event.payload.character).toBe(character)
            expect(instance.users.get(event.user.id)).toBe(event.user)
            const channel = new Channel(instance.localState)
            const entity = channel.addEntity({ nid: 0, ntype: 1, x: event.payload.character.x })
            channel.subscribe(event.user)
            instance.step()
            client.network.processNextFrame()
            expect(client.network.store.get(entity.nid)?.x).toBe(12)
        } finally {
            socket.end()
        }
    })

    it.each([undefined, null, false, 0, '', [], { nested: [null, false, ''] }].map(value => [value]))(
        'preserves the optional client JSON value %j', async clientData => {
            const { instance, adapter, client } = setup()
            instance.onConnect = async () => ({ clientData })
            const socket = adapter.createMockConnect()
            try {
                await expect(client.connect(socket.clientSocket)).resolves.toEqual(clientData)
                expect(instance.queue.next().payload).toBeUndefined()
                expect(client.connectionState).toBe('connected')
            } finally {
                socket.end()
            }
        }
    )

    it.each([true, {}, { serverData: { accountId: 7 } }])('accepts without client data: %j', async result => {
        const { instance, adapter, client } = setup()
        instance.onConnect = async () => result
        const socket = adapter.createMockConnect()
        try {
            await expect(client.connect(socket.clientSocket)).resolves.toBeUndefined()
            expect(instance.queue.next().payload).toBe(typeof result === 'object' ? result.serverData : undefined)
        } finally {
            socket.end()
        }
    })

    it.each(['cycle', 'bigint', 'function', 'serializer'])('denies unencodable client data (%s) and allows retry', async kind => {
        const { instance, adapter, client } = setup()
        const cyclic: any = {}
        cyclic.self = cyclic
        const values = {
            cycle: cyclic,
            bigint: BigInt(7),
            function: () => 1,
            serializer: { toJSON() { throw new Error('Cannot encode setup') } }
        }
        instance.onConnect = async () => ({ clientData: values[kind as keyof typeof values] })
        const socket = adapter.createMockConnect()
        const retry = adapter.createMockConnect()
        try {
            await expect(client.connect(socket.clientSocket)).rejects.toMatchObject({
                code: 'CONNECTION_DENIED', detail: { reason: 'server_error' }
            })
            expect(instance.users.size).toBe(0)
            expect(instance.queue.next().type).toBe(NetworkEvent.UserConnectionDenied)
            expect(instance.queue.length).toBe(0)
            expect(client.connectionState).toBe('idle')
            instance.onConnect = async () => ({ clientData: { room: 'retry' } })
            await expect(client.connect(retry.clientSocket)).resolves.toEqual({ room: 'retry' })
        } finally {
            socket.end()
            retry.end()
        }
    })

    it.each([undefined, null, 'accepted', [], new Date(0), { accountId: 'old payload' }].map(value => [value]))('rejects an invalid acceptance envelope: %j', async result => {
        const { instance, adapter, client } = setup()
        instance.onConnect = async () => result as any
        const socket = adapter.createMockConnect()
        try {
            await expect(client.connect(socket.clientSocket)).rejects.toMatchObject({
                code: 'CONNECTION_DENIED', detail: { reason: 'server_error' }
            })
            const event = instance.queue.next()
            expect(event.type).toBe(NetworkEvent.UserConnectionDenied)
            expect(event.payload.message).toContain('serverData')
            expect(instance.users.size).toBe(0)
        } finally {
            socket.end()
        }
    })

    it('discards late setup data after cancellation without contaminating a retry', async () => {
        const { instance, adapter, client } = setup()
        let finish!: (result: ConnectionAcceptance) => void
        instance.onConnect = () => new Promise(resolve => { finish = resolve })
        const abandoned = adapter.createMockConnect()
        const retry = adapter.createMockConnect()
        const toJSON = jest.fn(() => 'abandoned')
        try {
            const connecting = client.connect(abandoned.clientSocket)
            const rejected = expect(connecting).rejects.toMatchObject({ code: 'CANCELLED' })
            client.disconnect()
            await rejected
            instance.onConnect = async () => ({ serverData: 'current', clientData: 'current' })
            const replacement = client.connect(retry.clientSocket)
            finish({ serverData: 'abandoned', clientData: { toJSON } })
            await expect(replacement).resolves.toBe('current')
            expect(toJSON).not.toHaveBeenCalled()
            expect(instance.users.size).toBe(1)
            const events = []
            while (!instance.queue.isEmpty()) events.push(instance.queue.next())
            expect(events.filter(event => event.type === NetworkEvent.UserConnected)).toEqual([
                expect.objectContaining({ payload: 'current' })
            ])
        } finally {
            abandoned.end()
            retry.end()
        }
    })

    it('does not send acceptance if application serialization closes the connection', async () => {
        const { instance, adapter, client } = setup()
        const socket = adapter.createMockConnect()
        const send = jest.spyOn(adapter, 'send')
        instance.onConnect = async () => ({
            clientData: {
                toJSON() {
                    socket.end('setup abandoned')
                    return { room: 'abandoned' }
                }
            }
        })
        try {
            await expect(client.connect(socket.clientSocket)).rejects.toMatchObject({ code: 'REMOTE_CLOSE' })
            expect(send).not.toHaveBeenCalled()
            expect(instance.users.size).toBe(0)
        } finally {
            socket.end()
        }
    })
})
