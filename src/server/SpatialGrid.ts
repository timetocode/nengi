export type SpatialGridCell<T> = {
    key: string
    x: number
    y: number
    z: number
    objects: T[]
    ids: number[]
    version: number
}

export type SpatialGridCellRef = {
    key: string
    index: number
}

export type SpatialGridMove<T> = {
    object: T
    fromCell: string
    toCell: string
    removedCell: boolean
    createdCell: boolean
}

export type SpatialGridRange2D = {
    minX: number
    maxX: number
    minY: number
    maxY: number
}

export type SpatialGridRange3D = SpatialGridRange2D & {
    minZ: number
    maxZ: number
}

export type SpatialGrid2DOptions<T> = {
    cellSize: number
    getX(object: T): number
    getY(object: T): number
}

export type SpatialGrid3DOptions<T> = SpatialGrid2DOptions<T> & {
    getZ(object: T): number
}

export class SpatialGrid2D<T> {
    readonly cellSize: number
    readonly cells: Map<string, SpatialGridCell<T>> = new Map()
    readonly objectCells: Map<number, SpatialGridCellRef> = new Map()
    private getX: (object: T) => number
    private getY: (object: T) => number

    constructor(options: SpatialGrid2DOptions<T>) {
        this.cellSize = options.cellSize
        this.getX = options.getX
        this.getY = options.getY
    }

    cellCoord(value: number) {
        return Math.floor(value / this.cellSize)
    }

    cellCoordForEnd(value: number) {
        return Math.ceil(value / this.cellSize) - 1
    }

    cellKey(x: number, y: number) {
        return `${x}:${y}`
    }

    cellKeyForObject(object: T) {
        return this.cellKey(this.cellCoord(this.getX(object)), this.cellCoord(this.getY(object)))
    }

    getOrCreateCellForObject(object: T) {
        const x = this.cellCoord(this.getX(object))
        const y = this.cellCoord(this.getY(object))
        const key = this.cellKey(x, y)
        let cell = this.cells.get(key)
        if (!cell) {
            cell = { key, x, y, z: 0, objects: [], ids: [], version: 0 }
            this.cells.set(key, cell)
        }
        return cell
    }

    add(id: number, object: T) {
        const cell = this.getOrCreateCellForObject(object)
        const wasEmpty = cell.objects.length === 0
        this.objectCells.set(id, { key: cell.key, index: cell.objects.length })
        cell.objects.push(object)
        cell.ids.push(id)
        cell.version++
        return { cell, createdCell: wasEmpty }
    }

    remove(id: number) {
        const ref = this.objectCells.get(id)
        if (!ref) {
            return null
        }

        const cell = this.cells.get(ref.key)
        if (!cell) {
            this.objectCells.delete(id)
            return null
        }

        const lastIndex = cell.objects.length - 1
        const movedObject = cell.objects[lastIndex]
        const movedId = cell.ids[lastIndex]
        cell.objects[ref.index] = movedObject
        cell.ids[ref.index] = movedId
        cell.objects.pop()
        cell.ids.pop()
        if (movedId !== id) {
            this.objectCells.set(movedId, { key: ref.key, index: ref.index })
        }

        const removedCell = cell.objects.length === 0
        if (removedCell) {
            this.cells.delete(ref.key)
        } else {
            cell.version++
        }
        this.objectCells.delete(id)
        return { cell, removedCell }
    }

    update(id: number, object: T): SpatialGridMove<T> | null {
        const current = this.objectCells.get(id)
        if (!current) {
            return null
        }

        const nextKey = this.cellKeyForObject(object)
        if (current.key === nextKey) {
            return null
        }

        const fromCell = current.key
        const removed = this.remove(id)
        const added = this.add(id, object)
        return {
            object,
            fromCell,
            toCell: nextKey,
            removedCell: removed?.removedCell || false,
            createdCell: added.createdCell
        }
    }

    getVisibleCellKeys(range: SpatialGridRange2D) {
        const keys: string[] = []
        for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                const key = this.cellKey(cellX, cellY)
                if (this.cells.has(key)) {
                    keys.push(key)
                }
            }
        }
        return keys
    }
}

export class SpatialGrid3D<T> {
    readonly cellSize: number
    readonly cells: Map<string, SpatialGridCell<T>> = new Map()
    readonly objectCells: Map<number, SpatialGridCellRef> = new Map()
    private getX: (object: T) => number
    private getY: (object: T) => number
    private getZ: (object: T) => number

    constructor(options: SpatialGrid3DOptions<T>) {
        this.cellSize = options.cellSize
        this.getX = options.getX
        this.getY = options.getY
        this.getZ = options.getZ
    }

    cellCoord(value: number) {
        return Math.floor(value / this.cellSize)
    }

    cellCoordForEnd(value: number) {
        return Math.ceil(value / this.cellSize) - 1
    }

    cellKey(x: number, y: number, z: number) {
        return `${x}:${y}:${z}`
    }

    cellKeyForObject(object: T) {
        return this.cellKey(
            this.cellCoord(this.getX(object)),
            this.cellCoord(this.getY(object)),
            this.cellCoord(this.getZ(object))
        )
    }

    getOrCreateCellForObject(object: T) {
        const x = this.cellCoord(this.getX(object))
        const y = this.cellCoord(this.getY(object))
        const z = this.cellCoord(this.getZ(object))
        const key = this.cellKey(x, y, z)
        let cell = this.cells.get(key)
        if (!cell) {
            cell = { key, x, y, z, objects: [], ids: [], version: 0 }
            this.cells.set(key, cell)
        }
        return cell
    }

    add(id: number, object: T) {
        const cell = this.getOrCreateCellForObject(object)
        const wasEmpty = cell.objects.length === 0
        this.objectCells.set(id, { key: cell.key, index: cell.objects.length })
        cell.objects.push(object)
        cell.ids.push(id)
        cell.version++
        return { cell, createdCell: wasEmpty }
    }

    remove(id: number) {
        const ref = this.objectCells.get(id)
        if (!ref) {
            return null
        }

        const cell = this.cells.get(ref.key)
        if (!cell) {
            this.objectCells.delete(id)
            return null
        }

        const lastIndex = cell.objects.length - 1
        const movedObject = cell.objects[lastIndex]
        const movedId = cell.ids[lastIndex]
        cell.objects[ref.index] = movedObject
        cell.ids[ref.index] = movedId
        cell.objects.pop()
        cell.ids.pop()
        if (movedId !== id) {
            this.objectCells.set(movedId, { key: ref.key, index: ref.index })
        }

        const removedCell = cell.objects.length === 0
        if (removedCell) {
            this.cells.delete(ref.key)
        } else {
            cell.version++
        }
        this.objectCells.delete(id)
        return { cell, removedCell }
    }

    update(id: number, object: T): SpatialGridMove<T> | null {
        const current = this.objectCells.get(id)
        if (!current) {
            return null
        }

        const nextKey = this.cellKeyForObject(object)
        if (current.key === nextKey) {
            return null
        }

        const fromCell = current.key
        const removed = this.remove(id)
        const added = this.add(id, object)
        return {
            object,
            fromCell,
            toCell: nextKey,
            removedCell: removed?.removedCell || false,
            createdCell: added.createdCell
        }
    }

    getVisibleCellKeys(range: SpatialGridRange3D) {
        const keys: string[] = []
        for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                for (let cellZ = range.minZ; cellZ <= range.maxZ; cellZ++) {
                    const key = this.cellKey(cellX, cellY, cellZ)
                    if (this.cells.has(key)) {
                        keys.push(key)
                    }
                }
            }
        }
        return keys
    }
}
