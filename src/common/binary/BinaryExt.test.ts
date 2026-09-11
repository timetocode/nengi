import { Binary } from './Binary'
import { binaryGet, declareBinaryType } from './BinaryExt'

const arrayTypes = [
    [Binary.UInt8Array, Uint8Array], [Binary.Int8Array, Int8Array],
    [Binary.UInt16Array, Uint16Array], [Binary.Int16Array, Int16Array],
    [Binary.UInt32Array, Uint32Array], [Binary.Int32Array, Int32Array],
    [Binary.Float32Array, Float32Array], [Binary.Float64Array, Float64Array]
] as const

test.each(arrayTypes)('numeric array %s copies the visible range for cloning and fallback interpolation', (type, Constructor) => {
    const binary = binaryGet(type)
    const backing = new Constructor([1, 7, 3])
    const value = backing.subarray(1, 2)
    const copy = binary.clone(value)
    expect(copy).toBeInstanceOf(Constructor)
    expect(Array.from(copy)).toEqual([7])
    copy[0] = 99
    expect(backing[1]).toBe(7)
    const sample = binary.interp(new Constructor([2]), value, 0.5)
    expect(Array.from(sample)).toEqual([7])
    sample[0] = 100
    expect(backing[1]).toBe(7)
})

test('UInt8Array cloning also copies Buffer subviews instead of sharing their memory', () => {
    const backing = Buffer.from([1, 7, 3])
    const copy = binaryGet(Binary.UInt8Array).clone(backing.subarray(1, 2))
    expect(Array.from(copy)).toEqual([7])
    copy[0] = 99
    expect(backing[1]).toBe(7)
})

test('a custom mutable type uses its clone for default interpolation', () => {
    const type = Binary.LAST_INDEX + 102
    declareBinaryType(type, {
        write: (value: { x: number }, writer) => writer.writeFloat64(value.x),
        read: reader => ({ x: reader.readFloat64() }),
        byteSize: () => 8,
        compare: (a: { x: number }, b: { x: number }) => a.x === b.x,
        clone: (value: { x: number }) => ({ ...value })
    })
    const current = { x: 7 }
    const sample = binaryGet(type).interp({ x: 1 }, current, 0.5)
    expect(sample).toEqual({ x: 7 })
    sample.x = 99
    expect(current.x).toBe(7)
})

test('quaternion interpolation returns intermediate values', () => {
    const a = { x: 0, y: 0, z: 0, w: 1 }
    const b = { x: 0, y: 1, z: 0, w: 0 }
    const result = binaryGet(Binary.Quaternion).interp(a, b, 0.5)

    expect(result).not.toEqual(a)
    expect(result).not.toEqual(b)
    expect(result.y).toBeCloseTo(Math.SQRT1_2)
    expect(result.w).toBeCloseTo(Math.SQRT1_2)
})
