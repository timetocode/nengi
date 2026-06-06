import { AABB2D } from './AABB2D'

export type SpatialPlane = 'xy' | 'xz'
export type SpatialPlaneAxes = { a: 'x', b: 'y' | 'z' }

export type SpatialView =
    AABB2D |
    { x: number, y: number, halfX?: number, halfY?: number, halfWidth?: number, halfHeight?: number } |
    { x: number, z: number, halfX?: number, halfZ?: number, halfWidth?: number, halfDepth?: number } |
    { x: number, y: number, radius: number } |
    { x: number, z: number, radius: number }

export type SpatialPlaneView = {
    a: number
    b: number
    halfA: number
    halfB: number
    radius?: number
}

export function getSpatialPlaneAxes(plane: SpatialPlane = 'xy'): SpatialPlaneAxes {
    if (plane === 'xy') {
        return { a: 'x', b: 'y' }
    }
    if (plane === 'xz') {
        return { a: 'x', b: 'z' }
    }
    throw new Error(`Unsupported spatial plane "${plane}". Use "xy" or "xz".`)
}

function half(value: unknown, fallback: unknown) {
    return Number(value ?? fallback)
}

export function normalizeSpatialView(view: SpatialView, plane: SpatialPlane): SpatialPlaneView {
    if (plane === 'xz') {
        const xz = view as { x: number, z?: number, y?: number, halfX?: number, halfZ?: number, halfWidth?: number, halfDepth?: number, halfHeight?: number, radius?: number }
        const radius = Number(xz.radius)
        if (Number.isFinite(radius) && radius >= 0) {
            return {
                a: xz.x,
                b: Number(xz.z ?? xz.y),
                halfA: radius,
                halfB: radius,
                radius
            }
        }
        return {
            a: xz.x,
            b: Number(xz.z ?? xz.y),
            halfA: half(xz.halfX, xz.halfWidth),
            halfB: half(xz.halfZ, xz.halfDepth ?? xz.halfHeight)
        }
    }

    const xy = view as { x: number, y: number, halfX?: number, halfY?: number, halfWidth?: number, halfHeight?: number, radius?: number }
    const radius = Number(xy.radius)
    if (Number.isFinite(radius) && radius >= 0) {
        return {
            a: xy.x,
            b: xy.y,
            halfA: radius,
            halfB: radius,
            radius
        }
    }
    return {
        a: xy.x,
        b: xy.y,
        halfA: half(xy.halfX, xy.halfWidth),
        halfB: half(xy.halfY, xy.halfHeight)
    }
}

export function objectInSpatialView(obj: any, view: SpatialView, plane: SpatialPlane) {
    const axes = getSpatialPlaneAxes(plane)
    const normalized = normalizeSpatialView(view, plane)
    const a = obj[axes.a]
    const b = obj[axes.b]

    if (normalized.radius !== undefined) {
        const da = a - normalized.a
        const db = b - normalized.b
        return da * da + db * db <= normalized.radius * normalized.radius
    }

    return (
        a >= normalized.a - normalized.halfA &&
        a < normalized.a + normalized.halfA &&
        b >= normalized.b - normalized.halfB &&
        b < normalized.b + normalized.halfB
    )
}
