export declare class IdPool {
    ids: Set<number>;
    deferredIds: Set<number>;
    min: number;
    max: number;
    current: number;
    constructor(max: number);
    isFull(): boolean;
    hasFreshId(): boolean;
    setMax(max: number): void;
    nextId(): number;
    returnId(id: number): void;
    releaseDeferredIds(): void;
}
//# sourceMappingURL=IdPool.d.ts.map