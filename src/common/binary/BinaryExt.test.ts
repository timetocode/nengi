import { Binary } from './Binary'
import { binaryGet } from './BinaryExt'

test('quaternion interpolation returns intermediate values', () => {
    const a = { x: 0, y: 0, z: 0, w: 1 }
    const b = { x: 0, y: 1, z: 0, w: 0 }
    const result = binaryGet(Binary.Quaternion).interp(a, b, 0.5)

    expect(result).not.toEqual(a)
    expect(result).not.toEqual(b)
    expect(result.y).toBeCloseTo(Math.SQRT1_2)
    expect(result.w).toBeCloseTo(Math.SQRT1_2)
})

