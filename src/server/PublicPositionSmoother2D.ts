export type PublicPosition2D = {
    x: number
    y: number
}

export type PublicPositionSmoother2DOptions<T> = {
    getRaw: (target: T) => PublicPosition2D
    getPublic: (target: T) => PublicPosition2D
    setPublic: (target: T, x: number, y: number) => void
    followSpeed?: number
    snapDistance?: number
    settleDistance?: number
}

export type PublicPositionSmoothingResult = {
    distance: number
    moved: boolean
    snapped: boolean
}

/**
 * Follows a raw authoritative position with a public presentation position.
 * Good connections can stay effectively identical via settleDistance, while
 * large raw jumps from command bursts are smoothed for observers.
 */
export class PublicPositionSmoother2D<T> {
    private getRaw: (target: T) => PublicPosition2D
    private getPublic: (target: T) => PublicPosition2D
    private setPublic: (target: T, x: number, y: number) => void
    followSpeed: number
    snapDistance: number
    settleDistance: number

    constructor(options: PublicPositionSmoother2DOptions<T>) {
        this.getRaw = options.getRaw
        this.getPublic = options.getPublic
        this.setPublic = options.setPublic
        this.followSpeed = options.followSpeed ?? 420
        this.snapDistance = options.snapDistance ?? 240
        this.settleDistance = options.settleDistance ?? 10
    }

    step(target: T, dtMs: number): PublicPositionSmoothingResult {
        const raw = this.getRaw(target)
        const published = this.getPublic(target)
        const dx = raw.x - published.x
        const dy = raw.y - published.y
        const distance = Math.hypot(dx, dy)

        if (distance === 0) {
            return { distance, moved: false, snapped: false }
        }

        if (distance <= this.settleDistance || distance >= this.snapDistance) {
            this.setPublic(target, raw.x, raw.y)
            return { distance, moved: true, snapped: distance >= this.snapDistance }
        }

        const maxMove = Math.max(0, this.followSpeed) * Math.max(0, dtMs) / 1000
        if (maxMove >= distance) {
            this.setPublic(target, raw.x, raw.y)
            return { distance, moved: true, snapped: false }
        }

        const ratio = maxMove / distance
        this.setPublic(target, published.x + dx * ratio, published.y + dy * ratio)
        return { distance, moved: maxMove > 0, snapped: false }
    }
}
