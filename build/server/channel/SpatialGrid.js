"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpatialGrid3D = exports.SpatialGrid2D = void 0;
class SpatialGrid2D {
    constructor(options) {
        this.cells = new Map();
        this.objectCells = new Map();
        this.cellSize = options.cellSize;
        this.getX = options.getX;
        this.getY = options.getY;
        this.initializeCell = options.initializeCell;
    }
    cellCoord(value) {
        return Math.floor(value / this.cellSize);
    }
    cellCoordForEnd(value) {
        return Math.ceil(value / this.cellSize) - 1;
    }
    cellKey(x, y) {
        return `${x}:${y}`;
    }
    cellKeyForObject(object) {
        return this.cellKey(this.cellCoord(this.getX(object)), this.cellCoord(this.getY(object)));
    }
    getOrCreateCellForObject(object) {
        const x = this.cellCoord(this.getX(object));
        const y = this.cellCoord(this.getY(object));
        const key = this.cellKey(x, y);
        let cell = this.cells.get(key);
        if (!cell) {
            cell = { key, x, y, z: 0, objects: [], ids: [], version: 0 };
            if (this.initializeCell) {
                this.initializeCell(cell);
            }
            this.cells.set(key, cell);
        }
        return cell;
    }
    add(id, object) {
        const cell = this.getOrCreateCellForObject(object);
        const wasEmpty = cell.objects.length === 0;
        this.objectCells.set(id, { key: cell.key, index: cell.objects.length });
        cell.objects.push(object);
        cell.ids.push(id);
        cell.version++;
        return { cell, createdCell: wasEmpty };
    }
    remove(id) {
        const ref = this.objectCells.get(id);
        if (!ref) {
            return null;
        }
        const cell = this.cells.get(ref.key);
        if (!cell) {
            this.objectCells.delete(id);
            return null;
        }
        const lastIndex = cell.objects.length - 1;
        const movedObject = cell.objects[lastIndex];
        const movedId = cell.ids[lastIndex];
        cell.objects[ref.index] = movedObject;
        cell.ids[ref.index] = movedId;
        cell.objects.pop();
        cell.ids.pop();
        if (movedId !== id) {
            this.objectCells.set(movedId, { key: ref.key, index: ref.index });
        }
        const removedCell = cell.objects.length === 0;
        if (removedCell) {
            this.cells.delete(ref.key);
        }
        else {
            cell.version++;
        }
        this.objectCells.delete(id);
        return { cell, removedCell };
    }
    update(id, object) {
        const current = this.objectCells.get(id);
        if (!current) {
            return null;
        }
        const nextKey = this.cellKeyForObject(object);
        if (current.key === nextKey) {
            return null;
        }
        const fromCell = current.key;
        const removed = this.remove(id);
        const added = this.add(id, object);
        return {
            object,
            fromCell,
            toCell: nextKey,
            removedCell: (removed === null || removed === void 0 ? void 0 : removed.removedCell) || false,
            createdCell: added.createdCell
        };
    }
    getVisibleCellKeys(range) {
        const keys = [];
        for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                const key = this.cellKey(cellX, cellY);
                if (this.cells.has(key)) {
                    keys.push(key);
                }
            }
        }
        return keys;
    }
    getVisibleCellKeysInCircle(x, y, radius) {
        // Circle culling is coarse: include any occupied cell touched by the
        // circle and let gameplay/client logic tolerate the cell-sized margin.
        // Per-entity circle checks would erase much of the spatial win.
        const range = {
            minX: this.cellCoord(x - radius),
            maxX: this.cellCoordForEnd(x + radius),
            minY: this.cellCoord(y - radius),
            maxY: this.cellCoordForEnd(y + radius)
        };
        const radiusSq = radius * radius;
        const keys = [];
        for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
            const minX = cellX * this.cellSize;
            const maxX = minX + this.cellSize;
            const nearestX = x < minX ? minX : x > maxX ? maxX : x;
            const dx = x - nearestX;
            for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                const minY = cellY * this.cellSize;
                const maxY = minY + this.cellSize;
                const nearestY = y < minY ? minY : y > maxY ? maxY : y;
                const dy = y - nearestY;
                if (dx * dx + dy * dy > radiusSq) {
                    continue;
                }
                const key = this.cellKey(cellX, cellY);
                if (this.cells.has(key)) {
                    keys.push(key);
                }
            }
        }
        return keys;
    }
}
exports.SpatialGrid2D = SpatialGrid2D;
class SpatialGrid3D {
    constructor(options) {
        this.cells = new Map();
        this.objectCells = new Map();
        this.cellSize = options.cellSize;
        this.getX = options.getX;
        this.getY = options.getY;
        this.getZ = options.getZ;
        this.initializeCell = options.initializeCell;
    }
    cellCoord(value) {
        return Math.floor(value / this.cellSize);
    }
    cellCoordForEnd(value) {
        return Math.ceil(value / this.cellSize) - 1;
    }
    cellKey(x, y, z) {
        return `${x}:${y}:${z}`;
    }
    cellKeyForObject(object) {
        return this.cellKey(this.cellCoord(this.getX(object)), this.cellCoord(this.getY(object)), this.cellCoord(this.getZ(object)));
    }
    getOrCreateCellForObject(object) {
        const x = this.cellCoord(this.getX(object));
        const y = this.cellCoord(this.getY(object));
        const z = this.cellCoord(this.getZ(object));
        const key = this.cellKey(x, y, z);
        let cell = this.cells.get(key);
        if (!cell) {
            cell = { key, x, y, z, objects: [], ids: [], version: 0 };
            if (this.initializeCell) {
                this.initializeCell(cell);
            }
            this.cells.set(key, cell);
        }
        return cell;
    }
    add(id, object) {
        const cell = this.getOrCreateCellForObject(object);
        const wasEmpty = cell.objects.length === 0;
        this.objectCells.set(id, { key: cell.key, index: cell.objects.length });
        cell.objects.push(object);
        cell.ids.push(id);
        cell.version++;
        return { cell, createdCell: wasEmpty };
    }
    remove(id) {
        const ref = this.objectCells.get(id);
        if (!ref) {
            return null;
        }
        const cell = this.cells.get(ref.key);
        if (!cell) {
            this.objectCells.delete(id);
            return null;
        }
        const lastIndex = cell.objects.length - 1;
        const movedObject = cell.objects[lastIndex];
        const movedId = cell.ids[lastIndex];
        cell.objects[ref.index] = movedObject;
        cell.ids[ref.index] = movedId;
        cell.objects.pop();
        cell.ids.pop();
        if (movedId !== id) {
            this.objectCells.set(movedId, { key: ref.key, index: ref.index });
        }
        const removedCell = cell.objects.length === 0;
        if (removedCell) {
            this.cells.delete(ref.key);
        }
        else {
            cell.version++;
        }
        this.objectCells.delete(id);
        return { cell, removedCell };
    }
    update(id, object) {
        const current = this.objectCells.get(id);
        if (!current) {
            return null;
        }
        const nextKey = this.cellKeyForObject(object);
        if (current.key === nextKey) {
            return null;
        }
        const fromCell = current.key;
        const removed = this.remove(id);
        const added = this.add(id, object);
        return {
            object,
            fromCell,
            toCell: nextKey,
            removedCell: (removed === null || removed === void 0 ? void 0 : removed.removedCell) || false,
            createdCell: added.createdCell
        };
    }
    getVisibleCellKeys(range) {
        const keys = [];
        for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                for (let cellZ = range.minZ; cellZ <= range.maxZ; cellZ++) {
                    const key = this.cellKey(cellX, cellY, cellZ);
                    if (this.cells.has(key)) {
                        keys.push(key);
                    }
                }
            }
        }
        return keys;
    }
    getVisibleCellKeysInSphere(x, y, z, radius) {
        // Sphere culling follows the same coarse-cell rule as 2D circles. The
        // channel avoids per-entity tests so large 3D views remain grid-bound
        // instead of entity-count-bound.
        const range = {
            minX: this.cellCoord(x - radius),
            maxX: this.cellCoordForEnd(x + radius),
            minY: this.cellCoord(y - radius),
            maxY: this.cellCoordForEnd(y + radius),
            minZ: this.cellCoord(z - radius),
            maxZ: this.cellCoordForEnd(z + radius)
        };
        const radiusSq = radius * radius;
        const keys = [];
        for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
            const minX = cellX * this.cellSize;
            const maxX = minX + this.cellSize;
            const nearestX = x < minX ? minX : x > maxX ? maxX : x;
            const dx = x - nearestX;
            for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                const minY = cellY * this.cellSize;
                const maxY = minY + this.cellSize;
                const nearestY = y < minY ? minY : y > maxY ? maxY : y;
                const dy = y - nearestY;
                const dxy = dx * dx + dy * dy;
                if (dxy > radiusSq) {
                    continue;
                }
                for (let cellZ = range.minZ; cellZ <= range.maxZ; cellZ++) {
                    const minZ = cellZ * this.cellSize;
                    const maxZ = minZ + this.cellSize;
                    const nearestZ = z < minZ ? minZ : z > maxZ ? maxZ : z;
                    const dz = z - nearestZ;
                    if (dxy + dz * dz > radiusSq) {
                        continue;
                    }
                    const key = this.cellKey(cellX, cellY, cellZ);
                    if (this.cells.has(key)) {
                        keys.push(key);
                    }
                }
            }
        }
        return keys;
    }
}
exports.SpatialGrid3D = SpatialGrid3D;
