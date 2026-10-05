export type PublicPathSmoother2DOptions = {
    x: number
    y: number
    /** World units per second. */
    speed: number
    catchupSpeed?: number
    /** Remaining path length above which catchupSpeed is used. Defaults to 0. */
    catchupDistance?: number
    maxWaypoints?: number
    /** Enqueue returns false if the total remaining path would exceed this length. */
    maxDistance?: number
}

export type PublicPathWaypoint2D = { readonly x: number, readonly y: number }

type Waypoint = { x: number, y: number }

function finitePosition(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Path coordinates must be finite.')
}

/**
 * An optional, game-owned public body. Enqueue each raw simulation position,
 * then step once per server tick and publish x/y. Points are copied; the ring
 * preserves turns without scanning or shifting the backlog on each enqueue.
 *
 * A full/overlong path rejects the new point without changing the existing path.
 * Game code chooses whether to defer movement, reset, or disconnect. reset() is
 * an explicit teleport; publish the corresponding skip-interpolation marker.
 */
export class PublicPathSmoother2D {
    private points: Waypoint[] = []
    private head = 0
    private count = 0
    private positionX: number
    private positionY: number
    private distance = 0
    readonly speed: number
    readonly catchupSpeed: number
    readonly catchupDistance: number
    readonly maxWaypoints: number
    readonly maxDistance: number

    constructor(options: PublicPathSmoother2DOptions) {
        finitePosition(options.x, options.y)
        this.positionX = options.x
        this.positionY = options.y
        this.speed = options.speed
        this.catchupSpeed = options.catchupSpeed ?? options.speed * 1.25
        this.catchupDistance = options.catchupDistance ?? 0
        this.maxWaypoints = options.maxWaypoints ?? 128
        this.maxDistance = options.maxDistance ?? Infinity
        if (!Number.isFinite(this.speed) || this.speed <= 0 ||
            !Number.isFinite(this.catchupSpeed) || this.catchupSpeed < this.speed ||
            !Number.isFinite(this.catchupDistance) || this.catchupDistance < 0 ||
            !Number.isSafeInteger(this.maxWaypoints) || this.maxWaypoints < 1 ||
            !(this.maxDistance > 0)) {
            throw new RangeError('Invalid public path speed, catch-up distance, or backlog limit.')
        }
    }

    get x() { return this.positionX }
    get y() { return this.positionY }
    get remainingWaypoints() { return this.count }
    get queuedDistance() { return this.distance }

    enqueue(x: number, y: number): boolean {
        finitePosition(x, y)
        const tail = this.count > 0 ? this.points[(this.head + this.count - 1) % this.maxWaypoints] : undefined
        const length = Math.hypot(x - (tail?.x ?? this.x), y - (tail?.y ?? this.y))
        if (length === 0) return true
        const distance = this.distance + length
        if (this.count === this.maxWaypoints || !Number.isFinite(distance) || distance > this.maxDistance) return false
        const index = (this.head + this.count) % this.maxWaypoints
        const point = this.points[index]
        if (point) {
            point.x = x
            point.y = y
        } else {
            this.points[index] = { x, y }
        }
        this.count++
        this.distance = distance
        return true
    }

    /** Copies a complete route, or returns false without queuing any part of it. */
    enqueueRoute(route: readonly PublicPathWaypoint2D[]): boolean {
        const tail = this.count > 0 ? this.points[(this.head + this.count - 1) % this.maxWaypoints] : undefined
        const startX = tail?.x ?? this.x
        const startY = tail?.y ?? this.y
        let x = startX
        let y = startY
        let count = this.count
        let distance = this.distance

        // Preflight before touching the ring: one input may turn several times
        // during collision resolution, and accepting only its prefix is wrong.
        for (const point of route) {
            finitePosition(point.x, point.y)
            const length = Math.hypot(point.x - x, point.y - y)
            if (length === 0) continue
            count++
            distance += length
            if (count > this.maxWaypoints || !Number.isFinite(distance) || distance > this.maxDistance) return false
            x = point.x
            y = point.y
        }

        x = startX
        y = startY
        for (const point of route) {
            if (point.x === x && point.y === y) continue
            const index = (this.head + this.count) % this.maxWaypoints
            const stored = this.points[index]
            if (stored) {
                stored.x = point.x
                stored.y = point.y
            } else {
                this.points[index] = { x: point.x, y: point.y }
            }
            this.count++
            x = point.x
            y = point.y
        }
        this.distance = distance
        return true
    }

    /** Returns whether the public position moved. dtMs is elapsed server time. */
    step(dtMs: number): boolean {
        if (!Number.isFinite(dtMs) || dtMs < 0) throw new RangeError('Path step duration must be finite and nonnegative.')
        if (this.count === 0 || dtMs === 0) return false
        const speed = this.distance > this.catchupDistance ? this.catchupSpeed : this.speed
        let remaining = speed * dtMs / 1000
        while (remaining > 0 && this.count > 0) {
            const point = this.points[this.head]
            const dx = point.x - this.x
            const dy = point.y - this.y
            const length = Math.hypot(dx, dy)
            if (remaining >= length) {
                this.positionX = point.x
                this.positionY = point.y
                remaining -= length
                this.distance -= length
                this.head = (this.head + 1) % this.maxWaypoints
                this.count--
            } else {
                const ratio = remaining / length
                this.positionX += dx * ratio
                this.positionY += dy * ratio
                this.distance -= remaining
                remaining = 0
            }
        }
        this.distance = this.count === 0 ? 0 : Math.max(0, this.distance)
        return true
    }

    reset(x: number, y: number) {
        finitePosition(x, y)
        this.positionX = x
        this.positionY = y
        this.head = 0
        this.count = 0
        this.distance = 0
    }
}
