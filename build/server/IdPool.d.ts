declare class IdPool {
    ids: Set<number>;
    min: number;
    max: number;
    current: number;
    constructor(max: number);
    nextId(): number;
    returnId(id: number): void;
}
export { IdPool };
