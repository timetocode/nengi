import { PublicPathSmoother2D } from './PublicPathSmoother2D'

function path(options = {}) {
    return new PublicPathSmoother2D({ x: 0, y: 0, speed: 100, catchupSpeed: 100, ...options })
}

test('a burst follows its corner instead of cutting toward the final endpoint', () => {
    const body = path()
    body.enqueue(10, 0)
    body.enqueue(10, 10)
    body.step(50)
    expect([body.x, body.y]).toEqual([5, 0])
    body.step(100)
    expect([body.x, body.y]).toEqual([10, 5])
    expect(body.queuedDistance).toBeCloseTo(5)
    body.step(100)
    expect([body.x, body.y, body.queuedDistance, body.remainingWaypoints]).toEqual([10, 10, 0, 0])
    expect(body.step(100)).toBe(false)
})

test('catch-up closes a small lag under sustained movement', () => {
    const body = path({ catchupSpeed: 125, catchupDistance: 0 })
    body.enqueue(5, 0)
    for (let tick = 1; tick <= 20; tick++) {
        body.enqueue(5 + tick * 5, 0)
        body.step(50)
    }
    expect(body.x).toBe(105)
    expect(body.queuedDistance).toBe(0)
})

test('a full ring preserves the complete existing path and can be reused', () => {
    const body = path({ maxWaypoints: 2 })
    body.enqueue(10, 0)
    body.enqueue(10, 10)
    expect(body.enqueue(10, 10)).toBe(true) // Duplicate needs no slot.
    expect(body.enqueue(20, 10)).toBe(false)
    expect(body.queuedDistance).toBe(20)
    body.step(100)
    expect(body.enqueue(20, 10)).toBe(true)
    body.step(50)
    expect([body.x, body.y]).toEqual([10, 5])
    body.step(150)
    expect([body.x, body.y, body.queuedDistance]).toEqual([20, 10, 0])
})

test('distance overflow is explicit and teleport/reset discards the old route', () => {
    const body = path({ maxDistance: 20 })
    body.enqueue(10, 0)
    expect(body.enqueue(10, 20)).toBe(false)
    expect([body.remainingWaypoints, body.queuedDistance]).toEqual([1, 10])
    body.reset(200, 100)
    expect(body.step(50)).toBe(false)
    body.enqueue(205, 100)
    body.step(50)
    expect([body.x, body.y]).toEqual([205, 100])
})

test('zero time and invalid input cannot advance or poison the path', () => {
    const body = path()
    body.enqueue(10, 0)
    expect(body.step(0)).toBe(false)
    for (const dt of [-1, Infinity, NaN]) expect(() => body.step(dt)).toThrow(RangeError)
    expect(() => body.enqueue(NaN, 0)).toThrow(RangeError)
    expect(() => body.reset(0, Infinity)).toThrow(RangeError)
    expect([body.x, body.y, body.queuedDistance]).toEqual([0, 0, 10])
})
