import { Context } from '../common/Context';
import { Client } from './Client';
import { FixedStepInterpolator, FixedStepInterpolatorOptions } from './FixedStepInterpolator';
import { Snapshot } from './Snapshot';
declare class MockAdapter {
    binary: import("..").BinaryAdapter<Buffer, Buffer>;
    constructor();
    connect(): Promise<{
        accepted: boolean;
    }>;
    flush(): void;
}
export declare function createInterpolationTestContext(): Context;
export declare function createTestSnapshot(args: Partial<Snapshot>): Snapshot;
export declare function createInterpolationTestClient(tickRate?: number): Client<MockAdapter>;
export declare function applyTestSnapshot(client: Client, snapshot: Partial<Snapshot>, receivedAt: number): import("./Frame").Frame;
export declare class InterpolationTestHarness {
    context: Context;
    client: Client;
    interpolator: FixedStepInterpolator;
    now: number;
    constructor(options?: FixedStepInterpolatorOptions, now?: number, tickRate?: number);
    advance(ms: number): number;
    receive(snapshot: Partial<Snapshot>, receivedAt?: number): import("./Frame").Frame;
    receiveMovingFrames(receivedAtStart: number, count?: number, spacingMs?: number): void;
    sample(interpDelay: number, now?: number): import("./FixedStepInterpolator").InterpolationSample;
}
export {};
//# sourceMappingURL=InterpolationTestHarness.d.ts.map