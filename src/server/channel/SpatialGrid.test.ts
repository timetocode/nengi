import { SpatialGrid2D, SpatialGrid3D } from './SpatialGrid'

type Obj2D = { x: number, y: number }
type Obj3D = { x: number, y: number, z: number }

function createGrid2D() {
    return new SpatialGrid2D<Obj2D>({
        cellSize: 10,
        getX: obj => obj.x,
        getY: obj => obj.y
    })
}

function createGrid3D() {
    return new SpatialGrid3D<Obj3D>({
        cellSize: 10,
        getX: obj => obj.x,
        getY: obj => obj.y,
        getZ: obj => obj.z
    })
}

describe('SpatialGrid2D', () => {
    it('maps positive and negative coordinates to stable cell keys', () => {
        const grid = createGrid2D()

        expect(grid.cellCoord(0)).toBe(0)
        expect(grid.cellCoord(9.999)).toBe(0)
        expect(grid.cellCoord(10)).toBe(1)
        expect(grid.cellCoord(-0.001)).toBe(-1)
        expect(grid.cellCoord(-10)).toBe(-1)
        expect(grid.cellKeyForObject({ x: -1, y: -11 })).toBe('-1:-2')
    })

    it('adds objects, initializes cells, and tracks object cell refs', () => {
        const initialized: string[] = []
        const grid = new SpatialGrid2D<Obj2D>({
            cellSize: 10,
            getX: obj => obj.x,
            getY: obj => obj.y,
            initializeCell: cell => initialized.push(cell.key)
        })
        const object = { x: 1, y: 2 }

        const added = grid.add(1, object)

        expect(added.createdCell).toBe(true)
        expect(added.cell.key).toBe('0:0')
        expect(added.cell.objects).toEqual([object])
        expect(added.cell.ids).toEqual([1])
        expect(grid.objectCells.get(1)).toEqual({ key: '0:0', index: 0 })
        expect(initialized).toEqual(['0:0'])
    })

    it('uses swap-remove and updates the moved object ref', () => {
        const grid = createGrid2D()
        const first = { x: 1, y: 1 }
        const second = { x: 2, y: 2 }
        grid.add(1, first)
        grid.add(2, second)

        const removed = grid.remove(1)
        const cell = grid.cells.get('0:0')!

        expect(removed?.removedCell).toBe(false)
        expect(cell.objects).toEqual([second])
        expect(cell.ids).toEqual([2])
        expect(grid.objectCells.get(2)).toEqual({ key: '0:0', index: 0 })
        expect(grid.objectCells.has(1)).toBe(false)
    })

    it('deletes empty cells on remove', () => {
        const grid = createGrid2D()
        grid.add(1, { x: 1, y: 1 })

        const removed = grid.remove(1)

        expect(removed?.removedCell).toBe(true)
        expect(grid.cells.has('0:0')).toBe(false)
        expect(grid.objectCells.has(1)).toBe(false)
    })

    it('moves objects across cells and reports structural cell changes', () => {
        const grid = createGrid2D()
        const object = { x: 1, y: 1 }
        grid.add(1, object)
        object.x = 21

        const move = grid.update(1, object)

        expect(move).toEqual({
            object,
            fromCell: '0:0',
            toCell: '2:0',
            removedCell: true,
            createdCell: true
        })
        expect(grid.cells.has('0:0')).toBe(false)
        expect(grid.objectCells.get(1)).toEqual({ key: '2:0', index: 0 })
    })

    it('returns only occupied cells in rectangular and circular coarse queries', () => {
        const grid = createGrid2D()
        grid.add(1, { x: -1, y: -1 })
        grid.add(2, { x: 1, y: 1 })
        grid.add(3, { x: 10, y: 0 })

        expect(grid.getVisibleCellKeys({ minX: -1, maxX: 0, minY: -1, maxY: 0 }).sort()).toEqual(['-1:-1', '0:0'])
        expect(grid.getVisibleCellKeysInCircle(0, 0, 5).sort()).toEqual(['-1:-1', '0:0'])
    })
})

describe('SpatialGrid3D', () => {
    it('adds, removes, and deletes empty 3D cells', () => {
        const grid = createGrid3D()
        const object = { x: 1, y: 2, z: 3 }

        const added = grid.add(1, object)
        const removed = grid.remove(1)

        expect(added.cell.key).toBe('0:0:0')
        expect(added.createdCell).toBe(true)
        expect(removed?.removedCell).toBe(true)
        expect(grid.cells.has('0:0:0')).toBe(false)
        expect(grid.objectCells.has(1)).toBe(false)
    })

    it('moves objects across 3D cells', () => {
        const grid = createGrid3D()
        const object = { x: 1, y: 1, z: 1 }
        grid.add(1, object)
        object.y = 20
        object.z = -1

        const move = grid.update(1, object)

        expect(move?.fromCell).toBe('0:0:0')
        expect(move?.toCell).toBe('0:2:-1')
        expect(move?.removedCell).toBe(true)
        expect(move?.createdCell).toBe(true)
        expect(grid.objectCells.get(1)).toEqual({ key: '0:2:-1', index: 0 })
    })

    it('returns only occupied cells in volumetric and spherical coarse queries', () => {
        const grid = createGrid3D()
        grid.add(1, { x: -1, y: -1, z: -1 })
        grid.add(2, { x: 1, y: 1, z: 1 })
        grid.add(3, { x: 10, y: 0, z: 0 })

        expect(grid.getVisibleCellKeys({
            minX: -1,
            maxX: 0,
            minY: -1,
            maxY: 0,
            minZ: -1,
            maxZ: 0
        }).sort()).toEqual(['-1:-1:-1', '0:0:0'])
        expect(grid.getVisibleCellKeysInSphere(0, 0, 0, 5).sort()).toEqual(['-1:-1:-1', '0:0:0'])
    })
})
