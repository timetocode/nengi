import { Frame } from './Frame';
export type StaticInterpolationDelayConfig = {
    mode: 'static';
};
export type AdaptiveInterpolationDelayConfig = {
    mode: 'adaptive';
    windowFrames?: number;
    safetyTicks?: number;
    minMs?: number;
    maxMs?: number;
    maxSampleGapMs?: number;
    decreaseStableMs?: number;
    decreaseStepMs?: number;
    stableThresholdMs?: number;
};
export type InterpolationDelayConfig = StaticInterpolationDelayConfig | AdaptiveInterpolationDelayConfig;
export type LegacyInterpolationDelayPolicyOptions = {
    adaptiveDelay?: boolean;
    adaptiveWindowFrames?: number;
    adaptiveSafetyTicks?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    adaptiveMaxSampleGapMs?: number;
    adaptiveDecreaseStableMs?: number;
    adaptiveDecreaseStepMs?: number;
    adaptiveStableThresholdMs?: number;
};
export type InterpolationDelayPolicyOptions = LegacyInterpolationDelayPolicyOptions & {
    delay?: InterpolationDelayConfig;
};
export type ResolvedInterpolationDelayPolicyOptions = {
    mode: 'static' | 'adaptive';
    windowFrames: number;
    safetyTicks: number;
    minMs: number;
    maxMs: number;
    maxSampleGapMs: number;
    decreaseStableMs: number;
    decreaseStepMs: number;
    stableThresholdMs: number;
};
export interface InterpolationDelayPolicy {
    getDelayMs(requestedDelayMs: number, frames: Frame[], now: number): number;
    reset(): void;
}
export declare function resolveInterpolationDelayPolicyOptions(options: InterpolationDelayPolicyOptions, tickMs: number): ResolvedInterpolationDelayPolicyOptions;
export declare class StaticDelayPolicy implements InterpolationDelayPolicy {
    getDelayMs(requestedDelayMs: number): number;
    reset(): void;
}
export declare class AdaptiveDelayPolicy implements InterpolationDelayPolicy {
    private options;
    private tickMs;
    private activeDelayMs;
    private stableDelaySince;
    constructor(options: ResolvedInterpolationDelayPolicyOptions, tickMs: number);
    getDelayMs(_requestedDelayMs: number, frames: Frame[], now: number): number;
    reset(): void;
    private getMaxUsableFrameGapMs;
}
//# sourceMappingURL=InterpolationDelayPolicy.d.ts.map