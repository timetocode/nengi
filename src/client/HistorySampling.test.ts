import { Binary } from '../common/binary/Binary'
import { binaryGet, declareBinaryType } from '../common/binary/BinaryExt'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { InterpolationStatus } from './FixedStepInterpolator'
import { InterpolationTestHarness } from './InterpolationTestHarness'

test.each([false, true])('built-in array history and samples are independent with interp=%s', interp => {
    const harness = new InterpolationTestHarness()
    harness.context.register(2, defineEntitySchema({ bytes: { type: Binary.UInt8Array, interp } }))
    harness.receive({ createEntities: [{ nid: 2, ntype: 2, bytes: new Uint8Array([7]) }] })
    for (let i = 1; i < 4; i++) harness.receive({}, 1000 + i * 50)
    const history = harness.client.network.store.history
    history.getAt(2, 1)!.bytes[0] = 99
    expect(history.getAt(2, 1)!.bytes[0]).toBe(7)
    expect(harness.client.network.store.get(2)!.bytes[0]).toBe(7)
    harness.interpolator.sample(50, 1150).entities.get(2)!.bytes[0] = 100
    harness.interpolator.sampleEntities([2], 50, 1150).entities.get(2)!.bytes[0] = 101
    expect(harness.interpolator.sample(50, 1150).entities.get(2)!.bytes[0]).toBe(7)
    expect(history.getAt(2, 1)!.bytes[0]).toBe(7)
})

test('full sampling agrees with selected sampling across lifecycle boundaries and backward targets', () => {
    const harness = new InterpolationTestHarness()
    const bytesType = Binary.LAST_INDEX + 101
    declareBinaryType(bytesType, {
        ...binaryGet(Binary.UInt8Array),
        clone: (value: Uint8Array) => value.slice()
    })
    harness.context.register(2, defineEntitySchema({
        position: { type: Binary.Vector3, interp: true },
        angle: { type: Binary.Rotation, interp: true },
        bytes: bytesType,
        label: Binary.String
    }))
    harness.receive({ createEntities: [
        { nid: 1, ntype: 1, x: 1, y: 0, label: 'a' },
        { nid: 2, ntype: 2, position: { x: 0, y: 0, z: 0 }, angle: 6, bytes: new Uint8Array([1, 2]), label: 'a' },
        { nid: 4, ntype: 1, x: 4, y: 0, label: 'old' }
    ] })
    harness.receive({
        createEntities: [{ nid: 3, ntype: 1, x: 3, y: 0, label: 'new' }],
        updateEntities: [
            { nid: 2, prop: 'position', value: { x: 10, y: 20, z: 30 } },
            { nid: 2, prop: 'angle', value: 0.2 },
            { nid: 2, prop: 'bytes', value: new Uint8Array([3, 4]) },
            { nid: 2, prop: 'label', value: 'b' }
        ],
        deleteEntities: [4]
    }, 1050)
    harness.receive({
        createEntities: [{ nid: 4, ntype: 1, x: 400, y: 0, label: 'reused' }],
        deleteEntities: [1],
        updateEntities: [{ nid: 2, prop: 'position', value: { x: 100, y: 200, z: 300 } }],
        skipInterpolationNids: [2]
    }, 1100)
    harness.receive({}, 1150)
    const frames = harness.client.network.frames
    const interpolator = harness.interpolator
    const diagnostics = interpolator.getSampleDiagnostics(50, 1150)
    const bounds = jest.spyOn(interpolator, 'getSampleDiagnostics')
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 3], [1, 2], [0, 1]]) {
        interpolator.resetTimeline()
        for (const alpha of [0, 0.5, 1]) {
            bounds.mockReturnValue({ ...diagnostics, status: InterpolationStatus.Ok,
                frameA: frames[a], frameB: frames[b], alpha })
            const full = interpolator.sample(50, 1150).entities
            expect(full).toEqual(interpolator.sampleEntities([1, 2, 3, 4], 50, 1150).entities)
            for (const nid of [1, 2, 3, 4]) {
                expect(full.get(nid) ?? null).toEqual(interpolator.getEntity(nid, 50, 1150))
            }
            if (a === 0) {
                expect(full.has(3)).toBe(false)
                expect(full.get(4)!.label).toBe('old')
            }
            if (a === 1) {
                expect(full.get(2)!.position).toEqual({ x: 100, y: 200, z: 300 })
                expect(full.has(1)).toBe(true)
                expect(full.has(4)).toBe(false)
            }
            const sampled = full.get(2)!
            sampled.position.x = -999
            sampled.bytes[0] = 255
            const again = interpolator.sample(50, 1150).entities.get(2)!
            expect(again.position.x).not.toBe(-999)
            expect(again.bytes[0]).not.toBe(255)
            expect(harness.client.network.store.history.getAt(2, frames[b].tick)!.position.x).not.toBe(-999)
        }
    }
    bounds.mockRestore()
})
