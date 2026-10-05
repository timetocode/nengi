import { PublicPathSmoother2D } from './PublicPathSmoother2D'
import { PublicPathSmoother3D } from './PublicPathSmoother3D'

describe.each(['2D', '3D'] as const)('%s route admission', dimension => {
    function create(options = {}) {
        const config = { x: 0, y: 0, z: 0, speed: 100, catchupSpeed: 100, ...options }
        return dimension === '2D' ? new PublicPathSmoother2D(config) : new PublicPathSmoother3D(config)
    }

    test('a rejected multi-turn input leaves the earlier path intact', () => {
        const body = create({ maxWaypoints: 3 })
        body.enqueueRoute([{ x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }])
        body.step(50)
        expect(body.enqueueRoute([{ x: 20, y: 10, z: 0 }, { x: 20, y: 20, z: 0 }])).toBe(false)
        expect(body.remainingWaypoints).toBe(2)
        expect(body.queuedDistance).toBe(15)
        body.step(200)
        expect([body.x, body.y]).toEqual([10, 10])
    })

    test('distance admission includes existing backlog and commits no partial route', () => {
        const body = create({ maxDistance: 25 })
        body.enqueueRoute([{ x: 10, y: 0, z: 0 }])
        expect(body.enqueueRoute([{ x: 10, y: 10, z: 0 }, { x: 20, y: 10, z: 0 }])).toBe(false)
        body.step(500)
        expect([body.x, body.y]).toEqual([10, 0])
        expect(body.enqueueRoute([{ x: 10, y: 25, z: 0 }])).toBe(true)
    })

    test('validation failure after a valid waypoint leaves the path unchanged', () => {
        const body = create()
        expect(() => body.enqueueRoute([{ x: 10, y: 0, z: 0 }, { x: NaN, y: 10, z: 0 }])).toThrow(RangeError)
        expect(body.step(1000)).toBe(false)
        expect([body.x, body.y, body.queuedDistance]).toEqual([0, 0, 0])
    })

    test('duplicate points need no slot, copies preserve turns, and the ring wraps', () => {
        const body = create({ maxWaypoints: 2 })
        const points = [{ x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }]
        expect(body.enqueueRoute(points)).toBe(true)
        expect(body.enqueueRoute([{ x: 10, y: 10, z: 0 }])).toBe(true)
        points[0].x = 999
        body.step(100)
        expect([body.x, body.y]).toEqual([10, 0])
        expect(body.enqueueRoute([{ x: 20, y: 10, z: 0 }])).toBe(true)
        body.step(150)
        expect([body.x, body.y, body.queuedDistance]).toEqual([15, 10, 5])
        body.step(100)
        expect([body.x, body.y, body.remainingWaypoints]).toEqual([20, 10, 0])
    })
})

test('3D paths preserve vertical turns, catch up, and reset without leftover motion', () => {
    const body = new PublicPathSmoother3D({ x: 0, y: 0, z: 0, speed: 100, catchupSpeed: 200, catchupDistance: 10 })
    body.enqueue(0, 0, 10)
    body.enqueueRoute([{ x: 0, y: 10, z: 10 }, { x: 10, y: 10, z: 10 }])
    body.step(75)
    expect([body.x, body.y, body.z]).toEqual([0, 5, 10])
    body.step(25)
    expect([body.x, body.y, body.z]).toEqual([0, 10, 10])
    body.step(50)
    expect([body.x, body.y, body.z]).toEqual([5, 10, 10])
    body.reset(200, 100, -50)
    expect(body.step(100)).toBe(false)
    expect([body.x, body.y, body.z, body.queuedDistance]).toEqual([200, 100, -50, 0])
    expect(() => body.enqueue(0, 0, Infinity)).toThrow(RangeError)
    expect(() => body.reset(0, 0, NaN)).toThrow(RangeError)
    expect(() => body.step(-1)).toThrow(RangeError)
})
