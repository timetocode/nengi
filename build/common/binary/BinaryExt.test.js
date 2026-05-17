"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("./Binary");
const BinaryExt_1 = require("./BinaryExt");
test('quaternion interpolation returns intermediate values', () => {
    const a = { x: 0, y: 0, z: 0, w: 1 };
    const b = { x: 0, y: 1, z: 0, w: 0 };
    const result = (0, BinaryExt_1.binaryGet)(Binary_1.Binary.Quaternion).interp(a, b, 0.5);
    expect(result).not.toEqual(a);
    expect(result).not.toEqual(b);
    expect(result.y).toBeCloseTo(Math.SQRT1_2);
    expect(result.w).toBeCloseTo(Math.SQRT1_2);
});
