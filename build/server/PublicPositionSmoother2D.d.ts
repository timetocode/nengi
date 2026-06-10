export type PublicPosition2D = {
    x: number;
    y: number;
};
export type PublicPositionSmoother2DOptions<T> = {
    getRaw: (target: T) => PublicPosition2D;
    getPublic: (target: T) => PublicPosition2D;
    setPublic: (target: T, x: number, y: number) => void;
    followSpeed?: number;
    snapDistance?: number;
    settleDistance?: number;
};
export type PublicPositionSmoothingResult = {
    distance: number;
    moved: boolean;
    snapped: boolean;
};
/**
 * Follows a raw authoritative position with a public presentation position.
 * Good connections can stay effectively identical via settleDistance, while
 * large raw jumps from command bursts are smoothed for observers.
 */
export declare class PublicPositionSmoother2D<T> {
    private getRaw;
    private getPublic;
    private setPublic;
    followSpeed: number;
    snapDistance: number;
    settleDistance: number;
    constructor(options: PublicPositionSmoother2DOptions<T>);
    step(target: T, dtMs: number): PublicPositionSmoothingResult;
}
//# sourceMappingURL=PublicPositionSmoother2D.d.ts.map