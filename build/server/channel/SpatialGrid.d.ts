export type SpatialGridCell<T> = {
    key: string;
    x: number;
    y: number;
    z: number;
    objects: T[];
    ids: number[];
    version: number;
};
export type SpatialGridCellRef = {
    key: string;
    index: number;
};
export type SpatialGridMove<T> = {
    object: T;
    fromCell: string;
    toCell: string;
    removedCell: boolean;
    createdCell: boolean;
};
export type SpatialGridRange2D = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};
export type SpatialGridRange3D = SpatialGridRange2D & {
    minZ: number;
    maxZ: number;
};
export type SpatialGrid2DOptions<T> = {
    cellSize: number;
    getX(object: T): number;
    getY(object: T): number;
    initializeCell?: (cell: SpatialGridCell<T>) => void;
};
export type SpatialGrid3DOptions<T> = SpatialGrid2DOptions<T> & {
    getZ(object: T): number;
};
export declare class SpatialGrid2D<T> {
    readonly cellSize: number;
    readonly cells: Map<string, SpatialGridCell<T>>;
    readonly objectCells: Map<number, SpatialGridCellRef>;
    private getX;
    private getY;
    private initializeCell?;
    constructor(options: SpatialGrid2DOptions<T>);
    cellCoord(value: number): number;
    cellCoordForEnd(value: number): number;
    cellKey(x: number, y: number): string;
    cellKeyForObject(object: T): string;
    getOrCreateCellForObject(object: T): SpatialGridCell<T>;
    add(id: number, object: T): {
        cell: SpatialGridCell<T>;
        createdCell: boolean;
    };
    remove(id: number): {
        cell: SpatialGridCell<T>;
        removedCell: boolean;
    } | null;
    update(id: number, object: T): SpatialGridMove<T> | null;
    getVisibleCellKeys(range: SpatialGridRange2D): string[];
    getVisibleCellKeysInCircle(x: number, y: number, radius: number): string[];
}
export declare class SpatialGrid3D<T> {
    readonly cellSize: number;
    readonly cells: Map<string, SpatialGridCell<T>>;
    readonly objectCells: Map<number, SpatialGridCellRef>;
    private getX;
    private getY;
    private getZ;
    private initializeCell?;
    constructor(options: SpatialGrid3DOptions<T>);
    cellCoord(value: number): number;
    cellCoordForEnd(value: number): number;
    cellKey(x: number, y: number, z: number): string;
    cellKeyForObject(object: T): string;
    getOrCreateCellForObject(object: T): SpatialGridCell<T>;
    add(id: number, object: T): {
        cell: SpatialGridCell<T>;
        createdCell: boolean;
    };
    remove(id: number): {
        cell: SpatialGridCell<T>;
        removedCell: boolean;
    } | null;
    update(id: number, object: T): SpatialGridMove<T> | null;
    getVisibleCellKeys(range: SpatialGridRange3D): string[];
    getVisibleCellKeysInSphere(x: number, y: number, z: number, radius: number): string[];
}
//# sourceMappingURL=SpatialGrid.d.ts.map