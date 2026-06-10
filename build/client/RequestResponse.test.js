"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const createSnapshotBuffer_1 = __importDefault(require("../binary/snapshot/createSnapshotBuffer"));
const Binary_1 = require("../common/binary/Binary");
const defineSchema_1 = require("../common/binary/schema/defineSchema");
const Context_1 = require("../common/Context");
const Endpoint_1 = require("../common/Endpoint");
const Channel_1 = require("../server/channel/Channel");
const Instance_1 = require("../server/Instance");
const User_1 = require("../server/User");
const BufferBinary_1 = require("../testSupport/BufferBinary");
const ClientNetwork_1 = require("./ClientNetwork");
const schemaFingerprint_1 = require("../common/binary/schema/schemaFingerprint");
const Predictor_1 = require("./prediction/Predictor");
function createUser(instance) {
    const user = new User_1.User(undefined, {
        binary: BufferBinary_1.testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    });
    user.id = 1;
    user.instance = instance;
    return user;
}
function createClientNetwork(context) {
    const client = {
        context,
        serverTickRate: 20,
        disconnectHandler: jest.fn(),
        websocketErrorHandler: jest.fn(),
        predictor: new Predictor_1.Predictor(),
        network: undefined
    };
    const network = new ClientNetwork_1.ClientNetwork(client);
    client.network = network;
    return network;
}
function deliverRequestAndResponse(instance, user, clientNetwork) {
    const outbound = clientNetwork.createOutbound(BufferBinary_1.testBinaryAdapter);
    instance.network.onMessage(user, outbound);
    const responseBuffer = (0, createSnapshotBuffer_1.default)(user, instance);
    clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(responseBuffer));
    clientNetwork.processNextFrame();
}
describe('request/response', () => {
    it('receives protocol id widths during the connection handshake', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        context.register(300, (0, defineSchema_1.defineMessageSchema)({
            text: Binary_1.Binary.String
        }));
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        instance.onConnect = () => __awaiter(void 0, void 0, void 0, function* () { return true; });
        yield instance.network.onHandshake(user, {});
        const handshakeBuffer = user.networkAdapter.send.mock.calls[0][1];
        const response = clientNetwork.readHandshakeResponse(BufferBinary_1.testBinaryAdapter.createReader(handshakeBuffer));
        expect(response.accepted).toBe(true);
        expect(clientNetwork.protocol).toEqual({
            nidType: Binary_1.Binary.UInt8,
            ntypeType: Binary_1.Binary.UInt16
        });
    }));
    it('can require matching schema fingerprints during the connection handshake', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        context.register(1, (0, defineSchema_1.defineMessageSchema)({
            text: Binary_1.Binary.String
        }));
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        clientNetwork.sendSchemaFingerprint = true;
        instance.network.requireSchemaFingerprint = true;
        instance.onConnect = () => __awaiter(void 0, void 0, void 0, function* () { return true; });
        instance.network.onMessage(user, clientNetwork.createHandshake({}, BufferBinary_1.testBinaryAdapter));
        yield new Promise(resolve => setTimeout(resolve, 0));
        const handshakeBuffer = user.networkAdapter.send.mock.calls[0][1];
        const response = clientNetwork.readHandshakeResponse(BufferBinary_1.testBinaryAdapter.createReader(handshakeBuffer));
        expect(response.accepted).toBe(true);
        expect((0, schemaFingerprint_1.createSchemaFingerprint)(context)).toBe((0, schemaFingerprint_1.createSchemaFingerprint)(instance.context));
    }));
    it('denies schema fingerprint mismatches when required', () => __awaiter(void 0, void 0, void 0, function* () {
        const serverContext = new Context_1.Context();
        serverContext.register(1, (0, defineSchema_1.defineMessageSchema)({
            text: Binary_1.Binary.String
        }));
        const clientContext = new Context_1.Context();
        clientContext.register(1, (0, defineSchema_1.defineMessageSchema)({
            other: Binary_1.Binary.String
        }));
        const instance = new Instance_1.Instance(serverContext);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(clientContext);
        clientNetwork.sendSchemaFingerprint = true;
        instance.network.requireSchemaFingerprint = true;
        instance.onConnect = () => __awaiter(void 0, void 0, void 0, function* () { return true; });
        instance.network.onMessage(user, clientNetwork.createHandshake({}, BufferBinary_1.testBinaryAdapter));
        yield new Promise(resolve => setTimeout(resolve, 0));
        const handshakeBuffer = user.networkAdapter.send.mock.calls[0][1];
        const response = clientNetwork.readHandshakeResponse(BufferBinary_1.testBinaryAdapter.createReader(handshakeBuffer));
        expect(response.accepted).toBe(false);
        expect(response.reason.message).toContain('Schema fingerprint mismatch');
    }));
    it('denies missing schema fingerprints when required', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        context.register(1, (0, defineSchema_1.defineMessageSchema)({
            text: Binary_1.Binary.String
        }));
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        instance.network.requireSchemaFingerprint = true;
        instance.onConnect = () => __awaiter(void 0, void 0, void 0, function* () { return true; });
        instance.network.onMessage(user, clientNetwork.createHandshake({}, BufferBinary_1.testBinaryAdapter));
        yield new Promise(resolve => setTimeout(resolve, 0));
        const handshakeBuffer = user.networkAdapter.send.mock.calls[0][1];
        const response = clientNetwork.readHandshakeResponse(BufferBinary_1.testBinaryAdapter.createReader(handshakeBuffer));
        expect(response.accepted).toBe(false);
        expect(response.reason.message).toContain('Schema fingerprint required');
    }));
    it('accepts handshakes without schema fingerprints when not required', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        context.register(1, (0, defineSchema_1.defineMessageSchema)({
            text: Binary_1.Binary.String
        }));
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        instance.onConnect = () => __awaiter(void 0, void 0, void 0, function* () { return true; });
        instance.network.onMessage(user, clientNetwork.createHandshake({}, BufferBinary_1.testBinaryAdapter));
        yield new Promise(resolve => setTimeout(resolve, 0));
        const handshakeBuffer = user.networkAdapter.send.mock.calls[0][1];
        const response = clientNetwork.readHandshakeResponse(BufferBinary_1.testBinaryAdapter.createReader(handshakeBuffer));
        expect(response.accepted).toBe(true);
    }));
    it('round trips plain numeric endpoints with UTF-8 JSON payloads', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        instance.respond(1, ({ body }) => {
            return {
                ok: true,
                echoed: body.text
            };
        });
        const response = clientNetwork.request(1, { text: 'cafe\u0301' });
        deliverRequestAndResponse(instance, user, clientNetwork);
        yield expect(response).resolves.toEqual({
            ok: true,
            echoed: 'cafe\u0301'
        });
    }));
    it('round trips endpoint descriptors with binary request and response schemas', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const switchEndpoint = (0, Endpoint_1.defineEndpoint)(2, {
            requestSchema: (0, defineSchema_1.definePayloadSchema)({
                nid: Binary_1.Binary.UInt32,
                open: Binary_1.Binary.Boolean
            }),
            responseSchema: (0, defineSchema_1.definePayloadSchema)({
                accepted: Binary_1.Binary.Boolean,
                label: Binary_1.Binary.String
            })
        });
        let receivedBody;
        instance.respond(switchEndpoint, ({ body }) => {
            receivedBody = body;
            return {
                accepted: body.open,
                label: 'cafe\u0301'
            };
        });
        const response = clientNetwork.request(switchEndpoint, { nid: 42, open: true });
        deliverRequestAndResponse(instance, user, clientNetwork);
        expect(receivedBody).toEqual({ nid: 42, open: true });
        yield expect(response).resolves.toEqual({
            accepted: true,
            label: 'cafe\u0301'
        });
    }));
    it('reconciles request prediction before callback and promise observers run', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const localSwitch = { open: false };
        const callbackStates = [];
        const setSwitch = (0, Endpoint_1.defineEndpoint)(16, {
            requestSchema: (0, defineSchema_1.definePayloadSchema)({
                nid: Binary_1.Binary.UInt32,
                open: Binary_1.Binary.Boolean
            }),
            responseSchema: (0, defineSchema_1.definePayloadSchema)({
                accepted: Binary_1.Binary.Boolean,
                open: Binary_1.Binary.Boolean
            })
        });
        instance.respond(setSwitch, () => {
            return {
                accepted: false,
                open: false
            };
        });
        const response = clientNetwork.request(setSwitch, { nid: 1, open: true }, {
            timeoutMs: 0,
            prediction: {
                affected: [{ nid: 1, props: ['open'] }],
                applyLocal: () => {
                    localSwitch.open = true;
                },
                validate: ({ response }) => response.accepted,
                reconcile: ({ accepted, response }) => {
                    if (!accepted) {
                        localSwitch.open = response.open;
                    }
                }
            },
            callback: () => {
                callbackStates.push(localSwitch.open);
            }
        });
        expect(localSwitch.open).toBe(true);
        deliverRequestAndResponse(instance, user, clientNetwork);
        yield expect(response).resolves.toEqual({
            accepted: false,
            open: false
        });
        expect(callbackStates).toEqual([false]);
        expect(localSwitch.open).toBe(false);
        expect(clientNetwork.client.predictor.log.getPendingRequests()).toEqual([]);
    }));
    it('supports send-style handlers and client callbacks', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        let callbackResponse;
        instance.respond(3, ({ body }, send) => {
            send({ ok: body.ok });
        });
        const response = clientNetwork.request(3, { ok: true }, value => {
            callbackResponse = value;
        });
        deliverRequestAndResponse(instance, user, clientNetwork);
        yield expect(response).resolves.toEqual({ ok: true });
        expect(callbackResponse).toEqual({ ok: true });
    }));
    it('resolves expected validation failures as normal responses', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        instance.respond(4, ({ body }) => {
            return {
                accepted: false,
                reason: `missing:${body.nid}`
            };
        });
        const response = clientNetwork.request(4, { nid: 123 });
        deliverRequestAndResponse(instance, user, clientNetwork);
        yield expect(response).resolves.toEqual({
            accepted: false,
            reason: 'missing:123'
        });
    }));
    it('supports request-driven subscription where snapshots deliver opened scope state', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        let NType;
        (function (NType) {
            NType[NType["Inventory"] = 30] = "Inventory";
            NType[NType["ItemStack"] = 31] = "ItemStack";
        })(NType || (NType = {}));
        const context = new Context_1.Context();
        context.register(NType.Inventory, (0, defineSchema_1.defineEntitySchema)({
            chestNid: Binary_1.Binary.UInt32,
            slots: Binary_1.Binary.UInt8
        }));
        context.register(NType.ItemStack, (0, defineSchema_1.defineEntitySchema)({
            inventoryNid: Binary_1.Binary.UInt32,
            slot: Binary_1.Binary.UInt8,
            itemType: Binary_1.Binary.String,
            count: Binary_1.Binary.UInt8
        }));
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const inventory = {
            nid: 0,
            ntype: NType.Inventory,
            chestNid: 123,
            slots: 27
        };
        const inventoryChannel = new Channel_1.Channel(instance.localState, {
            label: 'chest:123:inventory',
            header: inventory
        });
        const item = inventoryChannel.addEntity({
            nid: 0,
            ntype: NType.ItemStack,
            inventoryNid: inventory.nid,
            slot: 0,
            itemType: 'iron',
            count: 32
        });
        const openChest = (0, Endpoint_1.defineEndpoint)(40, {
            requestSchema: (0, defineSchema_1.definePayloadSchema)({
                chestNid: Binary_1.Binary.UInt32
            }),
            responseSchema: (0, defineSchema_1.definePayloadSchema)({
                accepted: Binary_1.Binary.Boolean,
                chestNid: Binary_1.Binary.UInt32,
                inventoryNid: Binary_1.Binary.UInt32
            })
        });
        instance.respond(openChest, ({ user, body }) => {
            if (body.chestNid !== 123) {
                return { accepted: false, chestNid: body.chestNid, inventoryNid: 0 };
            }
            inventoryChannel.subscribe(user);
            return {
                accepted: true,
                chestNid: body.chestNid,
                inventoryNid: inventory.nid
            };
        });
        let callbackSawInventory = false;
        const response = clientNetwork.request(openChest, { chestNid: 123 }, {
            timeoutMs: 0,
            callback: value => {
                var _a;
                callbackSawInventory = ((_a = clientNetwork.store.getChannelHeader(inventoryChannel.nid)) === null || _a === void 0 ? void 0 : _a.nid) === value.inventoryNid;
            }
        });
        deliverRequestAndResponse(instance, user, clientNetwork);
        yield expect(response).resolves.toEqual({
            accepted: true,
            chestNid: 123,
            inventoryNid: inventory.nid
        });
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.createEntities).toEqual([
            item
        ]);
        expect((_b = clientNetwork.store.get(item.nid)) === null || _b === void 0 ? void 0 : _b.inventoryNid).toBe(inventory.nid);
        expect(clientNetwork.store.getChannelId(item.nid)).toBe(inventoryChannel.nid);
        expect(clientNetwork.store.getChannelHeader(item.nid)).toMatchObject({
            ntype: NType.Inventory,
            chestNid: 123,
            slots: 27
        });
        expect(clientNetwork.store.getByChannel(inventoryChannel.nid)).toEqual([
            item
        ]);
        expect(callbackSawInventory).toBe(true);
    }));
    it('rejects when no server endpoint is registered', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const missingEndpoint = (0, Endpoint_1.defineEndpoint)(5, {
            requestSchema: (0, defineSchema_1.definePayloadSchema)({
                nid: Binary_1.Binary.UInt32
            })
        });
        const response = clientNetwork.request(missingEndpoint, { nid: 123 });
        deliverRequestAndResponse(instance, user, clientNetwork);
        yield expect(response).rejects.toMatchObject({
            code: 'NO_ENDPOINT'
        });
    }));
    it('rejects when a request handler throws', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        instance.respond(6, () => {
            throw new Error('boom');
        });
        const response = clientNetwork.request(6, {});
        deliverRequestAndResponse(instance, user, clientNetwork);
        yield expect(response).rejects.toMatchObject({
            code: 'HANDLER_ERROR'
        });
    }));
    it('rejects requests that time out before a response arrives', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const clientNetwork = createClientNetwork(context);
        clientNetwork.requestTimeoutMs = 1;
        const response = clientNetwork.request(7, {});
        yield expect(response).rejects.toMatchObject({
            code: 'TIMEOUT'
        });
        expect(clientNetwork.requests.size).toBe(0);
        expect(clientNetwork.requestQueue.length).toBe(0);
    }));
    it('rejects pending requests on disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const clientNetwork = createClientNetwork(context);
        const response = clientNetwork.request(8, {});
        clientNetwork.onDisconnect('closed');
        yield expect(response).rejects.toMatchObject({
            code: 'DISCONNECTED'
        });
        expect(clientNetwork.requests.size).toBe(0);
    }));
    it('skips late binary responses after a timeout', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        clientNetwork.requestTimeoutMs = 1;
        const endpoint = (0, Endpoint_1.defineEndpoint)(9, {
            requestSchema: (0, defineSchema_1.definePayloadSchema)({
                nid: Binary_1.Binary.UInt32
            }),
            responseSchema: (0, defineSchema_1.definePayloadSchema)({
                accepted: Binary_1.Binary.Boolean
            })
        });
        instance.respond(endpoint, () => {
            return { accepted: true };
        });
        const response = clientNetwork.request(endpoint, { nid: 123 });
        const outbound = clientNetwork.createOutbound(BufferBinary_1.testBinaryAdapter);
        instance.network.onMessage(user, outbound);
        yield expect(response).rejects.toMatchObject({
            code: 'TIMEOUT'
        });
        const responseBuffer = (0, createSnapshotBuffer_1.default)(user, instance);
        expect(() => {
            clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(responseBuffer));
        }).not.toThrow();
    }));
    it('allows duplicate request keys by default', () => {
        const context = new Context_1.Context();
        const clientNetwork = createClientNetwork(context);
        const first = clientNetwork.request(10, { attempt: 1 }, {
            key: 'chest:1',
            timeoutMs: 0
        });
        const second = clientNetwork.request(10, { attempt: 2 }, {
            key: 'chest:1',
            timeoutMs: 0
        });
        expect(second).not.toBe(first);
        expect(clientNetwork.requests.size).toBe(2);
        first.catch(() => undefined);
        second.catch(() => undefined);
        clientNetwork.rejectPendingRequests(new Error('cleanup'));
    });
    it('dedupes pending requests with the same key', () => {
        const context = new Context_1.Context();
        const clientNetwork = createClientNetwork(context);
        const first = clientNetwork.request(11, { attempt: 1 }, {
            key: 'chest:1',
            policy: Endpoint_1.RequestPolicy.Dedupe,
            timeoutMs: 0
        });
        const second = clientNetwork.request(11, { attempt: 2 }, {
            key: 'chest:1',
            policy: Endpoint_1.RequestPolicy.Dedupe,
            timeoutMs: 0
        });
        expect(second).toBe(first);
        expect(clientNetwork.requests.size).toBe(1);
        expect(clientNetwork.requestQueue.length).toBe(1);
        first.catch(() => undefined);
        clientNetwork.rejectPendingRequests(new Error('cleanup'));
    });
    it('replaces pending requests with the same key', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = new Context_1.Context();
        const clientNetwork = createClientNetwork(context);
        const first = clientNetwork.request(12, { attempt: 1 }, {
            key: 'chest:1',
            policy: Endpoint_1.RequestPolicy.Replace,
            timeoutMs: 0
        });
        const second = clientNetwork.request(12, { attempt: 2 }, {
            key: 'chest:1',
            policy: Endpoint_1.RequestPolicy.Replace,
            timeoutMs: 0
        });
        expect(second).not.toBe(first);
        yield expect(first).rejects.toMatchObject({
            code: 'REPLACED'
        });
        expect(clientNetwork.requests.size).toBe(1);
        expect(clientNetwork.requestQueue.length).toBe(1);
        second.catch(() => undefined);
        clientNetwork.rejectPendingRequests(new Error('cleanup'));
    }));
    it('validates endpoint ids before queuing requests', () => {
        const context = new Context_1.Context();
        const clientNetwork = createClientNetwork(context);
        expect(() => (0, Endpoint_1.defineEndpoint)(0)).toThrow('Endpoint id');
        expect(() => (0, Endpoint_1.defineEndpoint)(Endpoint_1.MAX_UINT32 + 1)).toThrow('Endpoint id');
        expect(() => clientNetwork.request(0, {})).toThrow('Endpoint id');
    });
    it('wraps request ids without reusing pending ids', () => {
        const context = new Context_1.Context();
        const clientNetwork = createClientNetwork(context);
        clientNetwork.requestId = Endpoint_1.MAX_UINT32;
        const first = clientNetwork.request(13, {}, { timeoutMs: 0 });
        const second = clientNetwork.request(13, {}, { timeoutMs: 0 });
        expect(clientNetwork.requests.has(Endpoint_1.MAX_UINT32)).toBe(true);
        expect(clientNetwork.requests.has(1)).toBe(true);
        expect(clientNetwork.requestId).toBe(2);
        first.catch(() => undefined);
        second.catch(() => undefined);
        clientNetwork.rejectPendingRequests(new Error('cleanup'));
    });
    it('sends at most 255 queued requests per outbound frame', () => {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const onRequestBacklog = jest.fn();
        const received = [];
        clientNetwork.onRequestBacklog = onRequestBacklog;
        instance.respond(14, ({ body }) => {
            received.push(body.i);
            return { ok: true };
        });
        const pending = [];
        for (let i = 0; i < 256; i++) {
            const request = clientNetwork.request(14, { i }, { timeoutMs: 0 });
            request.catch(() => undefined);
            pending.push(request);
        }
        instance.network.onMessage(user, clientNetwork.createOutbound(BufferBinary_1.testBinaryAdapter));
        expect(received).toHaveLength(255);
        expect(received[0]).toBe(0);
        expect(received[254]).toBe(254);
        expect(clientNetwork.requestQueue.length).toBe(1);
        expect(onRequestBacklog).toHaveBeenCalledWith({
            queued: 256,
            sent: 255,
            remaining: 1,
            frame: 1
        });
        instance.network.onMessage(user, clientNetwork.createOutbound(BufferBinary_1.testBinaryAdapter));
        expect(received).toHaveLength(256);
        expect(received[255]).toBe(255);
        expect(clientNetwork.requestQueue.length).toBe(0);
        expect(onRequestBacklog).toHaveBeenCalledTimes(1);
        clientNetwork.rejectPendingRequests(new Error('cleanup'));
    });
    it('warns once by default when request backlog remains queued', () => {
        const context = new Context_1.Context();
        const clientNetwork = createClientNetwork(context);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        for (let i = 0; i < 256; i++) {
            const request = clientNetwork.request(15, { i }, { timeoutMs: 0 });
            request.catch(() => undefined);
        }
        clientNetwork.createOutbound(BufferBinary_1.testBinaryAdapter);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('nengi request backlog');
        clientNetwork.createOutbound(BufferBinary_1.testBinaryAdapter);
        expect(warn).toHaveBeenCalledTimes(1);
        clientNetwork.rejectPendingRequests(new Error('cleanup'));
        warn.mockRestore();
    });
});
