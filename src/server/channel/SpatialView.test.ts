import { AABB2D } from './AABB2D'
import { AABB3D } from './AABB3D'
import {
    getSpatialPlaneAxes,
    normalizeSpatialView,
    normalizeSpatialView3D,
    objectInSpatialView,
    objectInSpatialView3D
} from './SpatialView'

describe('SpatialView', () => {
    it('normalizes xy AABB-style views', () => {
        expect(normalizeSpatialView(new AABB2D(10, 20, 3, 4), 'xy')).toEqual({
            a: 10,
            b: 20,
            halfA: 3,
            halfB: 4
        })
        expect(getSpatialPlaneAxes('xy')).toEqual({ a: 'x', b: 'y' })
        expect(objectInSpatialView({ x: 12, y: 23 }, { x: 10, y: 20, halfWidth: 3, halfHeight: 4 }, 'xy')).toBe(true)
        expect(objectInSpatialView({ x: 13, y: 23 }, { x: 10, y: 20, halfWidth: 3, halfHeight: 4 }, 'xy')).toBe(false)
    })

    it('normalizes xz projected views without copying z into y', () => {
        expect(normalizeSpatialView({ x: 10, z: 30, halfX: 5, halfZ: 6 }, 'xz')).toEqual({
            a: 10,
            b: 30,
            halfA: 5,
            halfB: 6
        })
        expect(getSpatialPlaneAxes('xz')).toEqual({ a: 'x', b: 'z' })
        expect(objectInSpatialView({ x: 12, y: 999, z: 35 }, { x: 10, z: 30, halfX: 5, halfZ: 6 }, 'xz')).toBe(true)
        expect(objectInSpatialView({ x: 12, y: 30, z: 36 }, { x: 10, z: 30, halfX: 5, halfZ: 6 }, 'xz')).toBe(false)
    })

    it('normalizes 2D circular views and checks radial containment', () => {
        expect(normalizeSpatialView({ x: 10, y: 20, radius: 7 }, 'xy')).toEqual({
            a: 10,
            b: 20,
            halfA: 7,
            halfB: 7,
            radius: 7
        })
        expect(objectInSpatialView({ x: 13, y: 24 }, { x: 10, y: 20, radius: 5 }, 'xy')).toBe(true)
        expect(objectInSpatialView({ x: 14, y: 24 }, { x: 10, y: 20, radius: 5 }, 'xy')).toBe(false)
    })

    it('normalizes 3D AABB views and checks volumetric containment', () => {
        expect(normalizeSpatialView3D(new AABB3D(10, 20, 30, 4, 5, 6))).toEqual({
            x: 10,
            y: 20,
            z: 30,
            halfWidth: 4,
            halfHeight: 5,
            halfDepth: 6
        })
        expect(objectInSpatialView3D({ x: 13, y: 24, z: 35 }, new AABB3D(10, 20, 30, 4, 5, 6))).toBe(true)
        expect(objectInSpatialView3D({ x: 14, y: 24, z: 35 }, new AABB3D(10, 20, 30, 4, 5, 6))).toBe(false)
    })

    it('normalizes 3D spherical views and checks radial containment', () => {
        expect(normalizeSpatialView3D({ x: 10, y: 20, z: 30, radius: 9 })).toEqual({
            x: 10,
            y: 20,
            z: 30,
            halfWidth: 9,
            halfHeight: 9,
            halfDepth: 9,
            radius: 9
        })
        expect(objectInSpatialView3D({ x: 12, y: 23, z: 36 }, { x: 10, y: 20, z: 30, radius: 7 })).toBe(true)
        expect(objectInSpatialView3D({ x: 13, y: 24, z: 36 }, { x: 10, y: 20, z: 30, radius: 7 })).toBe(false)
    })

    it('rejects unsupported spatial planes', () => {
        expect(() => getSpatialPlaneAxes('yz' as any)).toThrow('Unsupported spatial plane')
    })
})
