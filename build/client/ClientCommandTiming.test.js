"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../common/binary/Binary");
const defineSchema_1 = require("../common/binary/schema/defineSchema");
const NetworkEvent_1 = require("../common/binary/NetworkEvent");
const Context_1 = require("../common/Context");
const Instance_1 = require("../server/Instance");
const User_1 = require("../server/User");
const BufferBinary_1 = require("../testSupport/BufferBinary");
const ClientNetwork_1 = require("./ClientNetwork");
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
describe('client command timing', () => {
    it('sends optional command timing metadata beside commands', () => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const context = new Context_1.Context();
        context.register(1, (0, defineSchema_1.defineMessageSchema)({
            value: Binary_1.Binary.UInt8
        }));
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        clientNetwork.addTimedCommand({ ntype: 1, value: 7 }, {
            inputTimeMs: 123,
            renderDelayMs: 50,
            viewTick: 4.5,
            viewServerTimeMs: 1000.25
        });
        instance.network.onMessage(user, clientNetwork.createOutbound(BufferBinary_1.testBinaryAdapter));
        const event = instance.queue.next();
        expect(event.type).toBe(NetworkEvent_1.NetworkEvent.CommandSet);
        expect(event.commands).toEqual([{ ntype: 1, value: 7 }]);
        expect((_b = (_a = event.commandTimings) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.commandIndex).toBe(0);
        expect((_d = (_c = event.commandTimings) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.clientTimeMs).toBe(123);
        expect((_f = (_e = event.commandTimings) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.renderDelayMs).toBe(50);
        expect((_h = (_g = event.commandTimings) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.viewTick).toBe(4.5);
        expect((_k = (_j = event.commandTimings) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.viewServerTimeMs).toBe(1000.25);
        expect(typeof ((_m = (_l = event.commandTimings) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.estimatedInputTimeMs)).toBe('number');
    });
    it('reports interpolation delay with throttling', () => {
        const context = new Context_1.Context();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        expect(clientNetwork.reportInterpolationDelay(100.4, { now: 1000 })).toBe(true);
        expect(clientNetwork.reportInterpolationDelay(100.6, { now: 1100 })).toBe(false);
        expect(clientNetwork.reportInterpolationDelay(125.2, { now: 1200 })).toBe(false);
        expect(clientNetwork.reportInterpolationDelay(125.2, { now: 1500 })).toBe(true);
        instance.network.onMessage(user, clientNetwork.createOutbound(BufferBinary_1.testBinaryAdapter));
        expect(user.interpolationDelayMs).toBe(125);
        expect(user.lastInterpolationDelayTimeMs).toBeGreaterThanOrEqual(0);
    });
});
