import createSnapshotBuffer from '../binary/snapshot/createSnapshotBuffer'
import { Buffer } from 'buffer'
import { Binary } from '../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema, definePayloadSchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { MAX_UINT32, RequestPolicy, defineEndpoint } from '../common/Endpoint'
import { Channel } from '../server/channel/Channel'
import { Instance } from '../server/Instance'
import { User, UserConnectionState } from '../server/User'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { ClientNetwork } from './ClientNetwork'
import { createSchemaFingerprint } from '../common/binary/schema/schemaFingerprint'
import { Predictor } from './prediction/Predictor'

function createUser(instance: Instance) {
    const user = new User(undefined, {
        binary: testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    } as any)
    user.id = 1
    user.instance = instance
    user.connectionState = UserConnectionState.Open
    return user
}

function createClientNetwork(context: Context) {
    const client = {
        context,
        serverTickRate: 20,
        disconnectHandler: jest.fn(),
        websocketErrorHandler: jest.fn(),
        predictor: new Predictor(),
        network: undefined as unknown as ClientNetwork
    }
    const network = new ClientNetwork(client as any)
    client.network = network
    return network
}

function deliverRequestAndResponse(instance: Instance, user: User, clientNetwork: ClientNetwork) {
    const outbound = clientNetwork.createOutbound(testBinaryAdapter)
    instance.network.onMessage(user, outbound)
    instance.processRequests()

    const responseBuffer = createSnapshotBuffer(user, instance) as Buffer
    clientNetwork.readSnapshot(testBinaryAdapter.createReader(responseBuffer))
    clientNetwork.processNextFrame()
}

describe('request/response', () => {
    it('receives protocol id widths during the connection handshake', async () => {
        const context = new Context()
        context.register(300, defineMessageSchema({
            text: Binary.String
        }))
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        instance.onConnect = async () => true

        await instance.network.onHandshake(user, {})

        const handshakeBuffer = (user.networkAdapter.send as jest.Mock).mock.calls[0][1] as Buffer
        const response = clientNetwork.readHandshakeResponse(testBinaryAdapter.createReader(handshakeBuffer))

        expect(response.accepted).toBe(true)
        expect(clientNetwork.protocol).toEqual({
            nidType: Binary.UInt8,
            ntypeType: Binary.UInt16
        })
    })

    it('can require matching schema fingerprints during the connection handshake', async () => {
        const context = new Context()
        context.register(1, defineMessageSchema({
            text: Binary.String
        }))
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        clientNetwork.sendSchemaFingerprint = true
        instance.network.requireSchemaFingerprint = true
        instance.onConnect = async () => true

        instance.network.onMessage(user, clientNetwork.createHandshake({}, testBinaryAdapter))

        await new Promise(resolve => setTimeout(resolve, 0))
        const handshakeBuffer = (user.networkAdapter.send as jest.Mock).mock.calls[0][1] as Buffer
        const response = clientNetwork.readHandshakeResponse(testBinaryAdapter.createReader(handshakeBuffer))

        expect(response.accepted).toBe(true)
        expect(createSchemaFingerprint(context)).toBe(createSchemaFingerprint(instance.context))
    })

    it('denies schema fingerprint mismatches when required', async () => {
        const serverContext = new Context()
        serverContext.register(1, defineMessageSchema({
            text: Binary.String
        }))
        const clientContext = new Context()
        clientContext.register(1, defineMessageSchema({
            other: Binary.String
        }))
        const instance = new Instance(serverContext)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(clientContext)
        clientNetwork.sendSchemaFingerprint = true
        instance.network.requireSchemaFingerprint = true
        instance.onConnect = async () => true

        instance.network.onMessage(user, clientNetwork.createHandshake({}, testBinaryAdapter))

        await new Promise(resolve => setTimeout(resolve, 0))
        const handshakeBuffer = (user.networkAdapter.send as jest.Mock).mock.calls[0][1] as Buffer
        const response = clientNetwork.readHandshakeResponse(testBinaryAdapter.createReader(handshakeBuffer))

        expect(response.accepted).toBe(false)
        expect(response.reason.message).toContain('Schema fingerprint mismatch')
    })

    it('denies missing schema fingerprints when required', async () => {
        const context = new Context()
        context.register(1, defineMessageSchema({
            text: Binary.String
        }))
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        instance.network.requireSchemaFingerprint = true
        instance.onConnect = async () => true

        instance.network.onMessage(user, clientNetwork.createHandshake({}, testBinaryAdapter))

        await new Promise(resolve => setTimeout(resolve, 0))
        const handshakeBuffer = (user.networkAdapter.send as jest.Mock).mock.calls[0][1] as Buffer
        const response = clientNetwork.readHandshakeResponse(testBinaryAdapter.createReader(handshakeBuffer))

        expect(response.accepted).toBe(false)
        expect(response.reason.message).toContain('Schema fingerprint required')
    })

    it('accepts handshakes without schema fingerprints when not required', async () => {
        const context = new Context()
        context.register(1, defineMessageSchema({
            text: Binary.String
        }))
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        instance.onConnect = async () => true

        instance.network.onMessage(user, clientNetwork.createHandshake({}, testBinaryAdapter))

        await new Promise(resolve => setTimeout(resolve, 0))
        const handshakeBuffer = (user.networkAdapter.send as jest.Mock).mock.calls[0][1] as Buffer
        const response = clientNetwork.readHandshakeResponse(testBinaryAdapter.createReader(handshakeBuffer))

        expect(response.accepted).toBe(true)
    })

    it('round trips plain numeric endpoints with UTF-8 JSON payloads', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)

        instance.respond(1, ({ body }) => {
            return {
                ok: true,
                echoed: body.text
            }
        })

        const response = clientNetwork.request(1, { text: 'cafe\u0301' })
        deliverRequestAndResponse(instance, user, clientNetwork)

        await expect(response).resolves.toEqual({
            ok: true,
            echoed: 'cafe\u0301'
        })
    })

    it('queues request handlers until the server explicitly processes requests', () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const received: any[] = []

        instance.respond(1, ({ body }) => {
            received.push(body)
            return { ok: true }
        })

        clientNetwork.request(1, { text: 'queued' }, { timeoutMs: 0 }).catch(() => undefined)
        instance.network.onMessage(user, clientNetwork.createOutbound(testBinaryAdapter))

        expect(received).toEqual([])
        expect(instance.network.requestQueue.length).toBe(1)

        expect(instance.processRequests()).toBe(1)
        expect(received).toEqual([{ text: 'queued' }])
        expect(instance.network.requestQueue.length).toBe(0)
    })

    it('rejects requests received before the connection is open', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const handler = jest.fn(() => ({ ok: true }))
        user.connectionState = UserConnectionState.OpenAwaitingHandshake

        instance.respond(1, handler)

        const response = clientNetwork.request(1, { text: 'early' })
        deliverRequestAndResponse(instance, user, clientNetwork)

        expect(handler).not.toHaveBeenCalled()
        expect(instance.network.requestQueue.length).toBe(0)
        await expect(response).rejects.toMatchObject({
            code: 'NOT_OPEN'
        })
    })

    it('round trips endpoint descriptors with binary request and response schemas', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)

        const switchEndpoint = defineEndpoint<
            { nid: number, open: boolean },
            { accepted: boolean, label: string }
        >(2, {
            requestSchema: definePayloadSchema({
                nid: Binary.UInt32,
                open: Binary.Boolean
            }),
            responseSchema: definePayloadSchema({
                accepted: Binary.Boolean,
                label: Binary.String
            })
        })

        let receivedBody: any
        instance.respond(switchEndpoint, ({ body }) => {
            receivedBody = body
            return {
                accepted: body.open,
                label: 'cafe\u0301'
            }
        })

        const response = clientNetwork.request(switchEndpoint, { nid: 42, open: true })
        deliverRequestAndResponse(instance, user, clientNetwork)

        expect(receivedBody).toEqual({ nid: 42, open: true })
        await expect(response).resolves.toEqual({
            accepted: true,
            label: 'cafe\u0301'
        })
    })

    it('reconciles request prediction before callback and promise observers run', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const localSwitch = { open: false }
        const callbackStates: boolean[] = []

        const setSwitch = defineEndpoint<
            { nid: number, open: boolean },
            { accepted: boolean, open: boolean }
        >(16, {
            requestSchema: definePayloadSchema({
                nid: Binary.UInt32,
                open: Binary.Boolean
            }),
            responseSchema: definePayloadSchema({
                accepted: Binary.Boolean,
                open: Binary.Boolean
            })
        })

        instance.respond(setSwitch, () => {
            return {
                accepted: false,
                open: false
            }
        })

        const response = clientNetwork.request(setSwitch, { nid: 1, open: true }, {
            timeoutMs: 0,
            prediction: {
                affected: [{ nid: 1, props: ['open'] }],
                applyLocal: () => {
                    localSwitch.open = true
                },
                validate: ({ response }) => response!.accepted,
                reconcile: ({ accepted, response }) => {
                    if (!accepted) {
                        localSwitch.open = response!.open
                    }
                }
            },
            callback: () => {
                callbackStates.push(localSwitch.open)
            }
        })

        expect(localSwitch.open).toBe(true)
        deliverRequestAndResponse(instance, user, clientNetwork)

        await expect(response).resolves.toEqual({
            accepted: false,
            open: false
        })
        expect(callbackStates).toEqual([false])
        expect(localSwitch.open).toBe(false)
        expect(clientNetwork.client.predictor.log.getPendingRequests()).toEqual([])
    })

    it('supports send-style handlers and client callbacks', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        let callbackResponse: any

        instance.respond(3, ({ body }, send) => {
            send({ ok: body.ok })
        })

        const response = clientNetwork.request(3, { ok: true }, value => {
            callbackResponse = value
        })
        deliverRequestAndResponse(instance, user, clientNetwork)

        await expect(response).resolves.toEqual({ ok: true })
        expect(callbackResponse).toEqual({ ok: true })
    })

    it('resolves expected validation failures as normal responses', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)

        instance.respond(4, ({ body }) => {
            return {
                accepted: false,
                reason: `missing:${body.nid}`
            }
        })

        const response = clientNetwork.request(4, { nid: 123 })
        deliverRequestAndResponse(instance, user, clientNetwork)

        await expect(response).resolves.toEqual({
            accepted: false,
            reason: 'missing:123'
        })
    })

    it('supports request-driven subscription where snapshots deliver opened scope state', async () => {
        enum NType {
            Inventory = 30,
            ItemStack = 31
        }
        const context = new Context()
        context.register(NType.Inventory, defineEntitySchema({
            chestNid: Binary.UInt32,
            slots: Binary.UInt8
        }))
        context.register(NType.ItemStack, defineEntitySchema({
            inventoryNid: Binary.UInt32,
            slot: Binary.UInt8,
            itemType: Binary.String,
            count: Binary.UInt8
        }))
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const inventory = {
            nid: 0,
            ntype: NType.Inventory,
            chestNid: 123,
            slots: 27
        }
        const inventoryChannel = new Channel(instance.localState, {
            name: 'chest:123:inventory',
            header: inventory
        })
        const item = inventoryChannel.addEntity({
            nid: 0,
            ntype: NType.ItemStack,
            inventoryNid: inventory.nid,
            slot: 0,
            itemType: 'iron',
            count: 32
        })
        const openChest = defineEndpoint<
            { chestNid: number },
            { accepted: boolean, chestNid: number, inventoryNid?: number }
        >(40, {
            requestSchema: definePayloadSchema({
                chestNid: Binary.UInt32
            }),
            responseSchema: definePayloadSchema({
                accepted: Binary.Boolean,
                chestNid: Binary.UInt32,
                inventoryNid: Binary.UInt32
            })
        })

        instance.respond(openChest, ({ user, body }) => {
            if (body.chestNid !== 123) {
                return { accepted: false, chestNid: body.chestNid, inventoryNid: 0 }
            }
            inventoryChannel.subscribe(user)
            return {
                accepted: true,
                chestNid: body.chestNid,
                inventoryNid: inventory.nid
            }
        })

        let callbackSawInventory = false
        const response = clientNetwork.request(openChest, { chestNid: 123 }, {
            timeoutMs: 0,
            callback: value => {
                callbackSawInventory = clientNetwork.store.getChannelHeader(inventoryChannel.nid)?.nid === value.inventoryNid
            }
        })
        deliverRequestAndResponse(instance, user, clientNetwork)

        await expect(response).resolves.toEqual({
            accepted: true,
            chestNid: 123,
            inventoryNid: inventory.nid
        })
        expect(clientNetwork.latestFrame!.requireChannel(inventoryChannel.nid).createEntities).toEqual([
            item
        ])
        expect(clientNetwork.store.get(item.nid)?.inventoryNid).toBe(inventory.nid)
        expect(clientNetwork.store.getChannelId(item.nid)).toBe(inventoryChannel.nid)
        expect(clientNetwork.store.getChannelHeader(item.nid)).toMatchObject({
            ntype: NType.Inventory,
            chestNid: 123,
            slots: 27
        })
        expect(clientNetwork.store.getByChannel(inventoryChannel.nid)).toEqual([
            item
        ])
        expect(callbackSawInventory).toBe(true)
    })

    it('rejects when no server endpoint is registered', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const missingEndpoint = defineEndpoint(5, {
            requestSchema: definePayloadSchema({
                nid: Binary.UInt32
            })
        })

        const response = clientNetwork.request(missingEndpoint, { nid: 123 })
        deliverRequestAndResponse(instance, user, clientNetwork)

        await expect(response).rejects.toMatchObject({
            code: 'NO_ENDPOINT'
        })
    })

    it('rejects when a request handler throws', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)

        instance.respond(6, () => {
            throw new Error('boom')
        })

        const response = clientNetwork.request(6, {})
        deliverRequestAndResponse(instance, user, clientNetwork)

        await expect(response).rejects.toMatchObject({
            code: 'HANDLER_ERROR'
        })
    })

    it('rejects requests that time out before a response arrives', async () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)
        clientNetwork.requestTimeoutMs = 1

        const response = clientNetwork.request(7, {})

        await expect(response).rejects.toMatchObject({
            code: 'TIMEOUT'
        })
        expect(clientNetwork.requests.size).toBe(0)
        expect(clientNetwork.requestQueue.length).toBe(0)
    })

    it('rejects pending requests on disconnect', async () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)

        const response = clientNetwork.request(8, {})
        clientNetwork.onDisconnect('closed')

        await expect(response).rejects.toMatchObject({
            code: 'DISCONNECTED'
        })
        expect(clientNetwork.requests.size).toBe(0)
    })

    it('skips late binary responses after a timeout', async () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        clientNetwork.requestTimeoutMs = 1

        const endpoint = defineEndpoint<
            { nid: number },
            { accepted: boolean }
        >(9, {
            requestSchema: definePayloadSchema({
                nid: Binary.UInt32
            }),
            responseSchema: definePayloadSchema({
                accepted: Binary.Boolean
            })
        })

        instance.respond(endpoint, () => {
            return { accepted: true }
        })

        const response = clientNetwork.request(endpoint, { nid: 123 })
        const outbound = clientNetwork.createOutbound(testBinaryAdapter)
        instance.network.onMessage(user, outbound)

        await expect(response).rejects.toMatchObject({
            code: 'TIMEOUT'
        })

        instance.processRequests()
        const responseBuffer = createSnapshotBuffer(user, instance) as Buffer
        expect(() => {
            clientNetwork.readSnapshot(testBinaryAdapter.createReader(responseBuffer))
        }).not.toThrow()
    })

    it('allows duplicate request keys by default', () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)

        const first = clientNetwork.request(10, { attempt: 1 }, {
            key: 'chest:1',
            timeoutMs: 0
        })
        const second = clientNetwork.request(10, { attempt: 2 }, {
            key: 'chest:1',
            timeoutMs: 0
        })

        expect(second).not.toBe(first)
        expect(clientNetwork.requests.size).toBe(2)
        first.catch(() => undefined)
        second.catch(() => undefined)
        clientNetwork.rejectPendingRequests(new Error('cleanup'))
    })

    it('dedupes pending requests with the same key', () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)

        const first = clientNetwork.request(11, { attempt: 1 }, {
            key: 'chest:1',
            policy: RequestPolicy.Dedupe,
            timeoutMs: 0
        })
        const second = clientNetwork.request(11, { attempt: 2 }, {
            key: 'chest:1',
            policy: RequestPolicy.Dedupe,
            timeoutMs: 0
        })

        expect(second).toBe(first)
        expect(clientNetwork.requests.size).toBe(1)
        expect(clientNetwork.requestQueue.length).toBe(1)
        first.catch(() => undefined)
        clientNetwork.rejectPendingRequests(new Error('cleanup'))
    })

    it('replaces pending requests with the same key', async () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)

        const first = clientNetwork.request(12, { attempt: 1 }, {
            key: 'chest:1',
            policy: RequestPolicy.Replace,
            timeoutMs: 0
        })
        const second = clientNetwork.request(12, { attempt: 2 }, {
            key: 'chest:1',
            policy: RequestPolicy.Replace,
            timeoutMs: 0
        })

        expect(second).not.toBe(first)
        await expect(first).rejects.toMatchObject({
            code: 'REPLACED'
        })
        expect(clientNetwork.requests.size).toBe(1)
        expect(clientNetwork.requestQueue.length).toBe(1)
        second.catch(() => undefined)
        clientNetwork.rejectPendingRequests(new Error('cleanup'))
    })

    it('validates endpoint ids before queuing requests', () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)

        expect(() => defineEndpoint(0)).toThrow('Endpoint id')
        expect(() => defineEndpoint(MAX_UINT32 + 1)).toThrow('Endpoint id')
        expect(() => clientNetwork.request(0, {})).toThrow('Endpoint id')
    })

    it('wraps request ids without reusing pending ids', () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)
        clientNetwork.requestId = MAX_UINT32

        const first = clientNetwork.request(13, {}, { timeoutMs: 0 })
        const second = clientNetwork.request(13, {}, { timeoutMs: 0 })

        expect(clientNetwork.requests.has(MAX_UINT32)).toBe(true)
        expect(clientNetwork.requests.has(1)).toBe(true)
        expect(clientNetwork.requestId).toBe(2)

        first.catch(() => undefined)
        second.catch(() => undefined)
        clientNetwork.rejectPendingRequests(new Error('cleanup'))
    })

    it('sends at most 255 queued requests per outbound frame', () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const onRequestBacklog = jest.fn()
        const received: number[] = []
        clientNetwork.onRequestBacklog = onRequestBacklog

        instance.respond(14, ({ body }) => {
            received.push(body.i)
            return { ok: true }
        })

        const pending: Promise<any>[] = []
        for (let i = 0; i < 256; i++) {
            const request = clientNetwork.request(14, { i }, { timeoutMs: 0 })
            request.catch(() => undefined)
            pending.push(request)
        }

        instance.network.onMessage(user, clientNetwork.createOutbound(testBinaryAdapter))

        expect(instance.network.requestQueue.length).toBe(255)
        expect(clientNetwork.requestQueue.length).toBe(1)
        instance.processRequests()
        expect(received).toHaveLength(255)
        expect(received[0]).toBe(0)
        expect(received[254]).toBe(254)
        expect(onRequestBacklog).toHaveBeenCalledWith({
            queued: 256,
            sent: 255,
            remaining: 1,
            frame: 1
        })

        instance.network.onMessage(user, clientNetwork.createOutbound(testBinaryAdapter))

        expect(instance.network.requestQueue.length).toBe(1)
        expect(clientNetwork.requestQueue.length).toBe(0)
        instance.processRequests()
        expect(received).toHaveLength(256)
        expect(received[255]).toBe(255)
        expect(onRequestBacklog).toHaveBeenCalledTimes(1)

        clientNetwork.rejectPendingRequests(new Error('cleanup'))
    })

    it('warns once by default when request backlog remains queued', () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

        for (let i = 0; i < 256; i++) {
            const request = clientNetwork.request(15, { i }, { timeoutMs: 0 })
            request.catch(() => undefined)
        }

        clientNetwork.createOutbound(testBinaryAdapter)

        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toContain('nengi request backlog')

        clientNetwork.createOutbound(testBinaryAdapter)

        expect(warn).toHaveBeenCalledTimes(1)

        clientNetwork.rejectPendingRequests(new Error('cleanup'))
        warn.mockRestore()
    })
})
