import { Binary } from './Binary'
import { binaryGet, declareBinaryType, CUSTOM_BINARY_TYPE_START } from './BinaryExt'
import { defineEntitySchema } from './schema/defineSchema'

describe('custom binary registration', () => {
    const specification = {
        write: (value: number, writer: any) => writer.writeFloat64(value),
        read: (reader: any) => reader.readFloat64(),
        byteSize: () => 8,
        compare: (a: number, b: number) => a === b
    }
    let nextId = CUSTOM_BINARY_TYPE_START + 1000

    it.each([0, -1, Binary.Float32, Binary.LAST_INDEX, CUSTOM_BINARY_TYPE_START - 1, 1024.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects reserved or invalid ID %s without replacing built-ins', id => {
        const builtin = binaryGet(Binary.Float32)
        expect(() => declareBinaryType(id, specification)).toThrow('safe integers at least')
        expect(binaryGet(Binary.Float32)).toBe(builtin)
        expect(builtin.byteSize(1)).toBe(4)
    })

    it('returns a schema type and rejects even identical duplicate declarations', () => {
        const id = nextId++
        const type = declareBinaryType(id, specification)
        const schema = defineEntitySchema({ value: type })
        const registered = binaryGet(type)
        expect(() => declareBinaryType(id, specification)).toThrow('already registered')
        expect(() => declareBinaryType(id, { ...specification, byteSize: () => 1 })).toThrow('already registered')
        expect(binaryGet(type)).toBe(registered)
        expect(schema.props.value.type).toBe(type)
        expect(schema.props.value.binary).toBe(registered)
        expect(registered.byteSize(1)).toBe(8)
    })

    it.each(['write', 'read', 'byteSize', 'compare', 'pre', 'post', 'interp', 'clone'])('rejects an invalid %s hook without reserving the ID', name => {
        const id = nextId++
        expect(() => declareBinaryType(id, { ...specification, [name]: true } as any)).toThrow()
        expect(() => binaryGet(id)).toThrow('Unknown binaryType')
        expect(declareBinaryType(id, specification)).toBe(id)
    })

    it('rejects a missing specification without reserving the ID', () => {
        const id = nextId++
        expect(() => declareBinaryType(id, null as any)).toThrow('specification object')
        expect(declareBinaryType(id, specification)).toBe(id)
    })
})

test.each([
    '', 'plain text', 'café', '旅人', 'ok🪁', '\u0000\u007f\u0080\u07ff\u0800',
    '\ud800', '\udbff', '\udc00', '\udfff', 'ok\ud83d', '\ud800\ud800',
    '\ud800a', '\ud800é', '\ud800旅', '\ud800\udbff\udfff', '\udfff\ud800\udc00',
    '\ufeffhello', '\ufeff\ufeffhello', 'x\ufeffhello'
])('String byte count agrees with the UTF-8 encoder for %j', value => {
    expect(binaryGet(Binary.String).byteSize(value)).toBe(4 + Buffer.byteLength(value, 'utf8'))
})

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
    const type = CUSTOM_BINARY_TYPE_START + 102
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
