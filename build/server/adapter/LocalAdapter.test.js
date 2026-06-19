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
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const Client_1 = require("../../client/Client");
const Instance_1 = require("../Instance");
const Channel_1 = require("../channel/Channel");
const MockAdapter_1 = require("./MockAdapter");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
class TestEntity {
    constructor() {
        this.nid = 0;
        this.ntype = 1;
        this.x = 5;
        this.y = 10;
    }
}
function createContext() {
    const context = new Context_1.Context();
    context.register(1, (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float32,
        y: Binary_1.Binary.Float32
    }));
    return context;
}
describe('LocalAdapter', () => {
    it('uses the normal handshake and snapshot pipeline without a socket library', () => __awaiter(void 0, void 0, void 0, function* () {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.onConnect = (handshake) => __awaiter(void 0, void 0, void 0, function* () { return handshake.role === 'local'; });
        const serverAdapter = new MockAdapter_1.LocalInstanceAdapter(instance.network, { binary: BufferBinary_1.testBinaryAdapter });
        serverAdapter.listen();
        const serverSocket = serverAdapter.createMockConnect();
        const client = new Client_1.Client(context, MockAdapter_1.LocalClientAdapter, 20, { binary: BufferBinary_1.testBinaryAdapter });
        const result = yield client.connect(serverSocket.clientSocket, { role: 'local' });
        expect(result.accepted).toBe(true);
        expect(instance.users.size).toBe(1);
        const channel = new Channel_1.Channel(instance.localState);
        const entity = channel.addEntity(new TestEntity());
        const user = Array.from(instance.users.values())[0];
        channel.subscribe(user);
        instance.step();
        const frame = client.network.processNextFrame();
        expect(frame).not.toBeNull();
        expect(frame.requireChannel(channel.nid).createEntities.map(created => created.nid)).toEqual([entity.nid]);
        expect(client.network.store.entities.get(entity.nid)).toMatchObject({
            nid: entity.nid,
            ntype: 1,
            x: 5,
            y: 10
        });
    }));
});
