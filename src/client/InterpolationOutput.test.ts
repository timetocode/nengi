import { Binary } from '../common/binary/Binary'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { AdaptiveInterpolator, StaticInterpolator, InterpolationStatus } from './FixedStepInterpolator'
import { InterpolationOutput } from './InterpolationOutput'
import { InterpolationTestHarness } from './InterpolationTestHarness'

test('reuses caller storage while allocating samples and other outputs remain independent', () => {
    const harness = new InterpolationTestHarness()
    harness.receiveMovingFrames(1000)
    const interpolator = harness.interpolator
    const output = new InterpolationOutput()
    const other = new InterpolationOutput()
    const entities = output.entities
    const fresh = interpolator.sampleEntities([1], 50, 1150)
    expect(interpolator.sampleEntitiesInto([1], output, 50, 1150)).toBe(output)
    interpolator.sampleEntitiesInto([1], other, 50, 1150)
    const pose = output.entities.get(1)!
    expect(pose).toEqual(fresh.entities.get(1))
    expect(pose).not.toBe(fresh.entities.get(1))
    expect(pose).not.toBe(other.entities.get(1))
    pose.x = -99
    pose.nid = -1
    interpolator.sampleEntitiesInto([1], output, 50, 1160)
    expect(output.entities).toBe(entities)
    expect(output.entities.get(1)).toBe(pose)
    expect(pose.nid).toBe(1)
    expect(pose.x).toBeGreaterThan(20)
    expect(fresh.entities.get(1)!.x).toBe(20)
    expect(other.entities.get(1)!.x).toBe(20)
    const expected = interpolator.sampleEntities([1], 50, 1160)
    expect(output.entities).toEqual(expected.entities)
    expect(output.frameA).toBe(expected.frameA)
    expect(output.frameB).toBe(expected.frameB)
    expect(output.alpha).toBe(expected.alpha)
    expect(output.desiredBufferMs).toBe(expected.desiredBufferMs)
})

test('removes unselected entries and releases storage on empty selection or clear', () => {
    const harness = new InterpolationTestHarness()
    harness.receive({ createEntities: [1, 2, 3].map(nid => ({ nid, ntype: 1, x: nid, y: 0, label: 'a' })) })
    harness.receive({}, 1050)
    const output = new InterpolationOutput()
    const sample = (nids: number[]) => harness.interpolator.sampleEntitiesInto(nids.values(), output, 25, 1050)
    sample([1, 2])
    const first = output.entities.get(1)
    const second = output.entities.get(2)
    sample([2, 1, 2, 999])
    expect([...output.entities.keys()]).toEqual([1, 2])
    sample([2, 3])
    expect([...output.entities.keys()]).toEqual([2, 3])
    expect(output.entities.get(2)).toBe(second)
    sample([1])
    expect(output.entities.get(1)).not.toBe(first)
    sample([])
    expect(output.entities.size).toBe(0)
    expect(output.status).toBe(InterpolationStatus.Ok)
    expect(output.frameA).not.toBeNull()
    sample([1])
    output.clear()
    expect(output.entities.size).toBe(0)
    expect(output.status).toBe(InterpolationStatus.InsufficientHistory)
    expect(output.frameA).toBeNull()
    expect(output.frameB).toBeNull()
    expect(sample([1]).entities.size).toBe(1)
})

test.each([false, true])('mutable properties remain independent with interp=%s', interp => {
    const harness = new InterpolationTestHarness()
    harness.context.register(2, defineEntitySchema({
        position: { type: Binary.Vector3, interp: true },
        bytes: { type: Binary.UInt8Array, interp }
    }))
    harness.receive({ createEntities: [{ nid: 2, ntype: 2, position: { x: 0, y: 0, z: 0 }, bytes: new Uint8Array([1]) }] })
    harness.receive({ updateEntities: [
        { nid: 2, prop: 'position', value: { x: 10, y: 20, z: 30 } },
        { nid: 2, prop: 'bytes', value: new Uint8Array([2]) }
    ] }, 1050)
    const output = new InterpolationOutput()
    const other = new InterpolationOutput()
    harness.interpolator.sampleEntitiesInto([2], output, 25, 1050)
    harness.interpolator.sampleEntitiesInto([2], other, 25, 1050)
    const pose = output.entities.get(2)!
    const position = pose.position
    const bytes = pose.bytes
    position.x = -100
    bytes[0] = 99
    expect(other.entities.get(2)!.position.x).toBe(5)
    expect(other.entities.get(2)!.bytes[0]).toBe(2)
    expect(harness.client.network.store.history.getAt(2, 2)!.bytes[0]).toBe(2)
    expect(harness.client.network.store.get(2)!.position.x).toBe(10)
    harness.interpolator.sampleEntitiesInto([2], output, 25, 1050)
    expect(output.entities.get(2)).toBe(pose)
    expect(pose.position).not.toBe(position)
    expect(pose.bytes).not.toBe(bytes)
    expect(pose.position.x).toBe(5)
    expect(pose.bytes[0]).toBe(2)
})

test('replaces incompatible schemas on ID reuse, including teleport selection of B', () => {
    const harness = new InterpolationTestHarness()
    harness.context.register(2, defineEntitySchema({ health: Binary.UInt8 }))
    const old = harness.receive({ createEntities: [{ nid: 1, ntype: 1, x: 1, y: 2, label: 'old' }] })
    const replaced = harness.receive({
        channelCloses: [{ channelId: 1 }],
        createEntities: [{ nid: 1, ntype: 2, health: 80 }],
        skipInterpolationNids: [1]
    }, 1050)
    const deleted = harness.receive({ deleteEntities: [1] }, 1100)
    const created = harness.receive({ createEntities: [{ nid: 1, ntype: 2, health: 100 }] }, 1150)
    const interpolator = harness.interpolator
    const diagnostics = interpolator.getSampleDiagnostics(50, 1100)
    const bounds = jest.spyOn(interpolator, 'getSampleDiagnostics')
    const output = new InterpolationOutput()
    bounds.mockReturnValue({ ...diagnostics, frameA: old, frameB: old })
    interpolator.sampleEntitiesInto([1], output, 50)
    const previous = output.entities.get(1)
    bounds.mockReturnValue({ ...diagnostics, frameA: old, frameB: replaced })
    interpolator.sampleEntitiesInto([1], output, 50)
    expect(output.entities.get(1)).toEqual({ nid: 1, ntype: 2, health: 80 })
    expect(output.entities.get(1)).not.toBe(previous)
    // Going backward into a deletion boundary must also remove the cached pose.
    bounds.mockReturnValue({ ...diagnostics, frameA: deleted, frameB: created })
    interpolator.sampleEntitiesInto([1], output, 50)
    expect(output.entities.size).toBe(0)
    bounds.mockReturnValue({ ...diagnostics, frameA: created, frameB: created })
    interpolator.sampleEntitiesInto([1], output, 50)
    expect(output.entities.get(1)).toEqual({ nid: 1, ntype: 2, health: 100 })
    bounds.mockRestore()
})

test('clears incompatible storage when another Context uses the same ntype', () => {
    const output = new InterpolationOutput()
    for (const prop of ['left', 'right']) {
        const harness = new InterpolationTestHarness()
        harness.context.register(2, defineEntitySchema({ [prop]: Binary.Float64 }))
        harness.receive({ createEntities: [{ nid: 2, ntype: 2, [prop]: 42 }] })
        harness.receive({}, 1050)
        harness.interpolator.sampleEntitiesInto([2], output, 25, 1050)
        expect(output.entities.get(2)).toEqual({ nid: 2, ntype: 2, [prop]: 42 })
    }
})

test('unavailable history and a throwing selection cannot leave stale poses', () => {
    const harness = new InterpolationTestHarness()
    harness.receiveMovingFrames(1000)
    const output = new InterpolationOutput()
    const interpolator = harness.interpolator
    const good = interpolator.getSampleDiagnostics(50, 1150)
    const bounds = jest.spyOn(interpolator, 'getSampleDiagnostics')
    for (const status of [InterpolationStatus.InsufficientHistory, InterpolationStatus.BeforeHistory, InterpolationStatus.AfterLatestFrame]) {
        bounds.mockReturnValue(good)
        interpolator.sampleEntitiesInto([1], output, 50)
        expect(output.entities.size).toBe(1)
        bounds.mockReturnValue({ ...good, status, frameA: null, frameB: null })
        interpolator.sampleEntitiesInto([1], output, 50)
        expect(output.entities.size).toBe(0)
        expect(output.status).toBe(status)
    }
    bounds.mockReturnValue(good)
    function* brokenSelection() {
        yield 1
        throw new Error('selection failed')
    }
    expect(() => interpolator.sampleEntitiesInto(brokenSelection(), output, 50)).toThrow('selection failed')
    expect(output.entities.size).toBe(0)
    expect(output.frameA).toBeNull()
    expect(interpolator.sampleEntitiesInto([1], output, 50).entities.size).toBe(1)
    bounds.mockRestore()
})

test.each([StaticInterpolator, AdaptiveInterpolator])('%p supports reusable sampling', Interpolator => {
    const harness = new InterpolationTestHarness()
    harness.receiveMovingFrames(1000)
    const interpolator = new Interpolator(harness.client)
    const output = new InterpolationOutput()
    const expected = interpolator.sampleEntities([1], 50, 1150)
    interpolator.sampleEntitiesInto([1], output, 50, 1150)
    expect(output.entities).toEqual(expected.entities)
    expect(output.desiredBufferMs).toBe(expected.desiredBufferMs)
    expect(output.alpha).toBe(expected.alpha)
})

test('rejects recursive writes to the same output and recovers for later samples', () => {
    const harness = new InterpolationTestHarness()
    harness.receiveMovingFrames(1000)
    const output = new InterpolationOutput()
    function* recursiveSelection() {
        yield 1
        harness.interpolator.sampleEntitiesInto([1], output, 50, 1150)
    }
    expect(() => harness.interpolator.sampleEntitiesInto(recursiveSelection(), output, 50, 1150)).toThrow('already being sampled')
    expect(output.entities.size).toBe(0)
    expect(harness.interpolator.sampleEntitiesInto([1], output, 50, 1150).entities.size).toBe(1)
})
