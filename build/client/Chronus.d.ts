declare class Chronus {
    timeDifferences: number[];
    averageTimeDifference: number;
    constructor();
    register(timestamp: number): void;
}
export { Chronus };
