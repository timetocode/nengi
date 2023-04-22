"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const IdPool_1 = __importDefault(require("./IdPool"));
test('throws when out of ids', () => {
    const idPool = new IdPool_1.default(5);
    idPool.nextId(); // 1
    idPool.nextId(); // 2
    idPool.nextId(); // 3
    idPool.nextId(); // 4
    idPool.nextId(); // 5
    expect(() => {
        idPool.nextId();
    }).toThrow();
});
test('recycles ids', () => {
    // only two ids (1, 2)
    const idPool = new IdPool_1.default(2);
    idPool.nextId(); // 1
    idPool.nextId(); // 2
    idPool.returnId(1);
    expect(idPool.nextId()).toEqual(1);
});
test('recycles ids, more complex', () => {
    const idPool = new IdPool_1.default(5);
    idPool.nextId(); // 1
    idPool.nextId(); // 2
    idPool.nextId(); // 3
    idPool.nextId(); // 4
    idPool.nextId(); // 5
    idPool.returnId(3);
    expect(idPool.nextId()).toEqual(3);
    expect(() => {
        idPool.nextId();
    }).toThrow();
    idPool.returnId(1);
    expect(idPool.nextId()).toEqual(1);
});
//# sourceMappingURL=IdPool.test.js.map