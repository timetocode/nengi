"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../common/binary/Binary");
const defineSchema_1 = require("../common/binary/schema/defineSchema");
const Context_1 = require("../common/Context");
const Historian_1 = require("./Historian");
const NDictionary_1 = require("./NDictionary");
describe('Historian', () => {
    it('records cloned snapshots and computes interpolated historical state', () => {
        var _a, _b;
        const context = new Context_1.Context();
        context.register(1, (0, defineSchema_1.defineEntitySchema)({
            x: { type: Binary_1.Binary.Float64, interp: true },
            state: Binary_1.Binary.UInt8
        }));
        const entities = new NDictionary_1.NDictionary();
        const entity = { nid: 1, ntype: 1, x: 0, state: 0 };
        entities.add(entity);
        const historian = new Historian_1.Historian(context, 10, 3);
        historian.record(1, entities);
        entity.x = 10;
        entity.state = 1;
        historian.record(2, entities);
        entity.x = 999;
        entity.state = 9;
        expect(historian.history[1].get(1)).toEqual({
            nid: 1,
            ntype: 1,
            x: 0,
            state: 0
        });
        expect(historian.history[2].get(1)).toEqual({
            nid: 1,
            ntype: 1,
            x: 10,
            state: 1
        });
        const computed = historian.getComputedLagCompensatedState(150);
        expect((_a = computed.get(1)) === null || _a === void 0 ? void 0 : _a.x).toBe(5);
        expect((_b = computed.get(1)) === null || _b === void 0 ? void 0 : _b.state).toBe(1);
    });
    it('removes snapshots older than the configured retention window', () => {
        const context = new Context_1.Context();
        context.register(1, (0, defineSchema_1.defineEntitySchema)({ x: Binary_1.Binary.Float64 }));
        const entities = new NDictionary_1.NDictionary();
        entities.add({ nid: 1, ntype: 1, x: 0 });
        const historian = new Historian_1.Historian(context, 10, 2);
        historian.record(1, entities);
        historian.record(2, entities);
        historian.record(3, entities);
        historian.record(4, entities);
        expect(historian.history[1]).toBeUndefined();
        expect(historian.history[2]).toBeDefined();
        expect(historian.history[3]).toBeDefined();
        expect(historian.history[4]).toBeDefined();
    });
});
