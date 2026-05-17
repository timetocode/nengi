"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const LocalState_1 = require("./LocalState");
const Binary_1 = require("../common/binary/Binary");
describe('LocalState', () => {
    it('assigns a nid of 1 to the first freshly added entity', () => {
        const localState = new LocalState_1.LocalState();
        const entity = { nid: 0, ntype: 1 };
        localState.registerEntity(entity, 1);
        expect(entity.nid).toEqual(1);
    });
    it('correctly associates an entity with a source', () => {
        const source = 123; // this is how channels work, they are just a source
        const localState = new LocalState_1.LocalState();
        const entity = { nid: 0, ntype: 1 };
        localState.registerEntity(entity, source);
        expect(entity.nid).toEqual(1);
        expect(localState.sources.get(1)).toEqual(new Set([123]));
        expect(localState.sources.get(1)).not.toEqual(new Set([321]));
    });
    it('correctly associates parents and children', () => {
        const source = 123; // this is how channels work, they are just a source
        const localState = new LocalState_1.LocalState();
        const parent = { nid: 0, ntype: 1 };
        const child = { nid: 0, ntype: 2 };
        localState.registerEntity(parent, source);
        expect(parent.nid).toEqual(1);
        localState.addChild(parent.nid, child);
        expect(child.nid).toEqual(2); // will be 2, now the second networked object
        expect(localState.sources.get(1)).toEqual(new Set([123]));
        expect(localState.children.get(1)).toEqual(new Set([2])); // entity 1 is now a parent, and it contains entity 2 in its Set
        //expect(localState.channelSources.get(2)).toEqual(new Set([]))
        localState.removeChild(parent.nid, child); // remove the child
        expect(localState.children.get(1)).toEqual(new Set([])); // the set is empty now
    });
    it('stays UInt8 by recycling released ids after the UInt8 range has wrapped', () => {
        const localState = new LocalState_1.LocalState();
        const entities = [];
        for (let i = 0; i < 255; i++) {
            const entity = { nid: 0, ntype: 1 };
            localState.registerEntity(entity, 1);
            entities.push(entity);
        }
        expect(localState.nidType).toBe(Binary_1.Binary.UInt8);
        for (let i = 100; i < 155; i++) {
            localState.unregisterEntity(entities[i], 1);
        }
        localState.releaseDeferredIds();
        const recycled = [];
        for (let i = 0; i < 55; i++) {
            const entity = { nid: 0, ntype: 1 };
            localState.registerEntity(entity, 1);
            recycled.push(entity);
        }
        expect(recycled[0].nid).toBe(101);
        expect(recycled[54].nid).toBe(155);
        expect(localState.nidType).toBe(Binary_1.Binary.UInt8);
    });
    it('widens to UInt16 when the live entity set exceeds UInt8', () => {
        const localState = new LocalState_1.LocalState();
        for (let i = 0; i < 255; i++) {
            localState.registerEntity({ nid: 0, ntype: 1 }, 1);
        }
        const widened = { nid: 0, ntype: 1 };
        localState.registerEntity(widened, 1);
        expect(widened.nid).toBe(256);
        expect(localState.nidType).toBe(Binary_1.Binary.UInt16);
    });
    it('widens to UInt16 when returned UInt8 ids are still deferred in the same frame', () => {
        const localState = new LocalState_1.LocalState();
        const entities = [];
        for (let i = 0; i < 255; i++) {
            const entity = { nid: 0, ntype: 1 };
            localState.registerEntity(entity, 1);
            entities.push(entity);
        }
        localState.unregisterEntity(entities[100], 1);
        const widened = { nid: 0, ntype: 1 };
        localState.registerEntity(widened, 1);
        expect(widened.nid).toBe(256);
        expect(localState.nidType).toBe(Binary_1.Binary.UInt16);
        localState.releaseDeferredIds();
        const next = { nid: 0, ntype: 1 };
        localState.registerEntity(next, 1);
        expect(next.nid).toBe(257);
        expect(localState.nidType).toBe(Binary_1.Binary.UInt16);
    });
});
