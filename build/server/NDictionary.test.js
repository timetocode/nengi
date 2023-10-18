"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const NDictionary_1 = require("./NDictionary");
describe('NDictionary', () => {
    it('adds entities correctly', () => {
        const nDict = new NDictionary_1.NDictionary();
        const entity1 = { nid: 1, ntype: 1 };
        const entity2 = { nid: 2, ntype: 2 };
        nDict.add(entity1);
        nDict.add(entity2);
        expect(nDict.get(1).ntype).toBe(1);
        expect(nDict.get(2).ntype).toBe(2);
    });
    it('removes entities correctly', () => {
        const nDict = new NDictionary_1.NDictionary();
        const entity1 = { nid: 1, ntype: 1 };
        const entity2 = { nid: 2, ntype: 2 };
        nDict.add(entity1);
        nDict.add(entity2);
        nDict.remove(entity1);
        expect(nDict.get(1)).toBeUndefined();
        expect(nDict.get(2).ntype).toBe(2);
    });
    it('maintains order after removal', () => {
        const nDict = new NDictionary_1.NDictionary();
        const entity1 = { nid: 1, ntype: 1 };
        const entity2 = { nid: 2, ntype: 2 };
        const entity3 = { nid: 3, ntype: 3 };
        nDict.add(entity1);
        nDict.add(entity2);
        nDict.add(entity3);
        nDict.remove(entity2);
        expect(nDict.get(1).ntype).toBe(1);
        expect(nDict.get(2)).toBeUndefined();
        expect(nDict.get(3).ntype).toBe(3);
    });
    it('iterates over all entities', () => {
        const nDict = new NDictionary_1.NDictionary();
        const entity1 = { nid: 1, ntype: 1 };
        const entity2 = { nid: 2, ntype: 2 };
        const entity3 = { nid: 3, ntype: 3 };
        nDict.add(entity1);
        nDict.add(entity2);
        nDict.add(entity3);
        let ntypes = [];
        nDict.forEach((entity, index) => {
            ntypes.push(entity.ntype);
        });
        expect(ntypes).toEqual([1, 2, 3]);
    });
});
