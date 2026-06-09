import { PublicPositionSmoother2D } from './PublicPositionSmoother2D'

type Entity = {
    rawX: number
    rawY: number
    x: number
    y: number
}

function createSmoother() {
    return new PublicPositionSmoother2D<Entity>({
        getRaw: entity => ({ x: entity.rawX, y: entity.rawY }),
        getPublic: entity => ({ x: entity.x, y: entity.y }),
        setPublic: (entity, x, y) => {
            entity.x = x
            entity.y = y
        },
        followSpeed: 100,
        snapDistance: 500,
        settleDistance: 5
    })
}

describe('PublicPositionSmoother2D', () => {
    it('settles immediately for small differences', () => {
        const entity = { rawX: 3, rawY: 4, x: 0, y: 0 }
        const smoother = createSmoother()

        const result = smoother.step(entity, 16)

        expect(result).toEqual({ distance: 5, moved: true, snapped: false })
        expect(entity.x).toBe(3)
        expect(entity.y).toBe(4)
    })

    it('follows larger differences by speed and dt', () => {
        const entity = { rawX: 100, rawY: 0, x: 0, y: 0 }
        const smoother = createSmoother()

        const result = smoother.step(entity, 100)

        expect(result).toEqual({ distance: 100, moved: true, snapped: false })
        expect(entity.x).toBe(10)
        expect(entity.y).toBe(0)
    })

    it('snaps when the presentation state is too far behind', () => {
        const entity = { rawX: 600, rawY: 0, x: 0, y: 0 }
        const smoother = createSmoother()

        const result = smoother.step(entity, 100)

        expect(result).toEqual({ distance: 600, moved: true, snapped: true })
        expect(entity.x).toBe(600)
        expect(entity.y).toBe(0)
    })
})
