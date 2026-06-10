"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpatialPlaneAxes = getSpatialPlaneAxes;
exports.normalizeSpatialView = normalizeSpatialView;
exports.objectInSpatialView = objectInSpatialView;
exports.normalizeSpatialView3D = normalizeSpatialView3D;
exports.objectInSpatialView3D = objectInSpatialView3D;
function getSpatialPlaneAxes(plane = 'xy') {
    if (plane === 'xy') {
        return { a: 'x', b: 'y' };
    }
    if (plane === 'xz') {
        return { a: 'x', b: 'z' };
    }
    throw new Error(`Unsupported spatial plane "${plane}". Use "xy" or "xz".`);
}
function half(value, fallback) {
    return Number(value !== null && value !== void 0 ? value : fallback);
}
function normalizeSpatialView(view, plane) {
    var _a, _b, _c;
    if (plane === 'xz') {
        const xz = view;
        const radius = Number(xz.radius);
        if (Number.isFinite(radius) && radius >= 0) {
            return {
                a: xz.x,
                b: Number((_a = xz.z) !== null && _a !== void 0 ? _a : xz.y),
                halfA: radius,
                halfB: radius,
                radius
            };
        }
        return {
            a: xz.x,
            // Accepting y as a fallback keeps object-style 2D views usable for
            // xz planes, but z is the clearer user-facing property.
            b: Number((_b = xz.z) !== null && _b !== void 0 ? _b : xz.y),
            halfA: half(xz.halfX, xz.halfWidth),
            halfB: half(xz.halfZ, (_c = xz.halfDepth) !== null && _c !== void 0 ? _c : xz.halfHeight)
        };
    }
    const xy = view;
    const radius = Number(xy.radius);
    if (Number.isFinite(radius) && radius >= 0) {
        return {
            a: xy.x,
            b: xy.y,
            halfA: radius,
            halfB: radius,
            radius
        };
    }
    return {
        a: xy.x,
        b: xy.y,
        halfA: half(xy.halfX, xy.halfWidth),
        halfB: half(xy.halfY, xy.halfHeight)
    };
}
function objectInSpatialView(obj, view, plane) {
    const axes = getSpatialPlaneAxes(plane);
    const normalized = normalizeSpatialView(view, plane);
    const a = obj[axes.a];
    const b = obj[axes.b];
    if (normalized.radius !== undefined) {
        const da = a - normalized.a;
        const db = b - normalized.b;
        return da * da + db * db <= normalized.radius * normalized.radius;
    }
    return (a >= normalized.a - normalized.halfA &&
        a < normalized.a + normalized.halfA &&
        b >= normalized.b - normalized.halfB &&
        b < normalized.b + normalized.halfB);
}
function normalizeSpatialView3D(view) {
    const candidate = view;
    const radius = Number(candidate.radius);
    if (Number.isFinite(radius) && radius >= 0) {
        return {
            x: candidate.x,
            y: candidate.y,
            z: candidate.z,
            halfWidth: radius,
            halfHeight: radius,
            halfDepth: radius,
            radius
        };
    }
    const aabb = view;
    return {
        x: aabb.x,
        y: aabb.y,
        z: aabb.z,
        halfWidth: aabb.halfWidth,
        halfHeight: aabb.halfHeight,
        halfDepth: aabb.halfDepth
    };
}
function objectInSpatialView3D(obj, view) {
    const normalized = normalizeSpatialView3D(view);
    if (normalized.radius !== undefined) {
        const dx = obj.x - normalized.x;
        const dy = obj.y - normalized.y;
        const dz = obj.z - normalized.z;
        return dx * dx + dy * dy + dz * dz <= normalized.radius * normalized.radius;
    }
    return (obj.x >= normalized.x - normalized.halfWidth &&
        obj.x < normalized.x + normalized.halfWidth &&
        obj.y >= normalized.y - normalized.halfHeight &&
        obj.y < normalized.y + normalized.halfHeight &&
        obj.z >= normalized.z - normalized.halfDepth &&
        obj.z < normalized.z + normalized.halfDepth);
}
