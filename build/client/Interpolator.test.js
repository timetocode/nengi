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
const Binary_1 = require("../common/binary/Binary");
const defineSchema_1 = require("../common/binary/schema/defineSchema");
const Context_1 = require("../common/Context");
const Client_1 = require("./Client");
const Interpolator_1 = require("./Interpolator");
function waitFor(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(() => { resolve(true); }, ms);
    });
}
test('', () => __awaiter(void 0, void 0, void 0, function* () {
    const aSchema = (0, defineSchema_1.defineSchema)({
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64,
        name: Binary_1.Binary.String
    });
    const ncontext = new Context_1.Context();
    ncontext.register(1, aSchema);
    class MockAdapter {
        constructor(network) {
        }
    }
    const client = new Client_1.Client(ncontext, MockAdapter, 20);
    // snapshot that creates 2 entities
    const a = {
        timestamp: -1,
        clientTick: -1,
        messages: [],
        createEntities: [{
                nid: 1,
                ntype: 1,
                x: 50,
                y: 50,
                name: 'Test Entity 1'
            },
            {
                nid: 2,
                ntype: 1,
                x: 100,
                y: 100,
                name: 'Test Entity 2'
            }],
        updateEntities: [],
        deleteEntities: []
    };
    client.network.snapshots.push(a);
    // snapshot that has the previously created enities moving
    const b = {
        timestamp: -1,
        clientTick: -1,
        messages: [],
        createEntities: [],
        updateEntities: [
            { nid: 1, prop: 'x', value: 70 },
            { nid: 1, prop: 'y', value: 70 },
            { nid: 2, prop: 'x', value: 120 },
            { nid: 2, prop: 'y', value: 120 },
        ],
        deleteEntities: []
    };
    client.network.snapshots.push(b);
    const interpolator = new Interpolator_1.Interpolator(client);
    yield waitFor(300);
    const iState = interpolator.getInterpolatedState(100);
    console.log('yolo', iState);
}));
//# sourceMappingURL=Interpolator.test.js.map