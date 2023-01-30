declare class Queue {
    arr: any[];
    constructor();
    isEmpty(): boolean;
    enqueue(item: any): void;
    dequeue(): any;
    peekNext(): any;
    get length(): number;
    next(): any;
}
export default Queue;
