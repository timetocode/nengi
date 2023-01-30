declare class NQueue<T> {
    arr: any[];
    constructor();
    isEmpty(): boolean;
    enqueue(item: any): void;
    dequeue(): T;
    peekNext(): any;
    get length(): number;
    next(): T;
}
export default NQueue;
