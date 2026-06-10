import { AABB2D } from './AABB2D';
import { AABB3D } from './AABB3D';
export type SpatialPlane = 'xy' | 'xz';
export type SpatialPlaneAxes = {
    a: 'x';
    b: 'y' | 'z';
};
export type SpatialView = AABB2D | {
    x: number;
    y: number;
    halfX?: number;
    halfY?: number;
    halfWidth?: number;
    halfHeight?: number;
} | {
    x: number;
    z: number;
    halfX?: number;
    halfZ?: number;
    halfWidth?: number;
    halfDepth?: number;
} | {
    x: number;
    y: number;
    radius: number;
} | {
    x: number;
    z: number;
    radius: number;
};
export type SpatialPlaneView = {
    a: number;
    b: number;
    halfA: number;
    halfB: number;
    radius?: number;
};
export type SpatialView3D = AABB3D | {
    x: number;
    y: number;
    z: number;
    radius: number;
};
export type NormalizedSpatialView3D = {
    x: number;
    y: number;
    z: number;
    halfWidth: number;
    halfHeight: number;
    halfDepth: number;
    radius?: number;
};
export declare function getSpatialPlaneAxes(plane?: SpatialPlane): SpatialPlaneAxes;
export declare function normalizeSpatialView(view: SpatialView, plane: SpatialPlane): SpatialPlaneView;
export declare function objectInSpatialView(obj: any, view: SpatialView, plane: SpatialPlane): boolean;
export declare function normalizeSpatialView3D(view: SpatialView3D): NormalizedSpatialView3D;
export declare function objectInSpatialView3D(obj: any, view: SpatialView3D): boolean;
//# sourceMappingURL=SpatialView.d.ts.map