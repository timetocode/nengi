import { IEntity } from '../common/IEntity';
import { Client } from './Client';
import { Frame } from './Frame';
import { InterpolationDelayPolicyOptions, ResolvedInterpolationDelayPolicyOptions } from './InterpolationDelayPolicy';
import { PlaybackCursorOptions, ResolvedPlaybackCursorOptions } from './PlaybackCursor';
export declare enum InterpolationStatus {
    Ok = "ok",
    InsufficientHistory = "insufficient-history",
    BeforeHistory = "before-history",
    AfterLatestFrame = "after-latest-frame"
}
export type InterpolationBounds = {
    frameA: Frame;
    frameB: Frame;
    alpha: number;
    targetTick: number;
    targetFrameTick: number;
    availableFirstTick: number;
    availableLastTick: number;
    desiredBufferMs: number;
    latestBufferMs: number;
    bufferErrorMs: number;
    desiredBufferTicks: number;
    latestBufferTicks: number;
    bufferErrorTicks: number;
};
export type InterpolationDiagnostics = {
    status: InterpolationStatus;
    targetTick: number;
    targetFrameTick: number;
    alpha: number;
    frameA: Frame | null;
    frameB: Frame | null;
    availableFirstTick: number | null;
    availableLastTick: number | null;
    desiredBufferMs: number;
    latestBufferMs: number | null;
    bufferErrorMs: number | null;
    desiredBufferTicks: number;
    latestBufferTicks: number | null;
    bufferErrorTicks: number | null;
};
export type InterpolationSample = InterpolationDiagnostics & {
    entities: Map<number, IEntity>;
};
export type InterpolatedState = InterpolationSample & {
    status: InterpolationStatus.Ok;
    frameA: Frame;
    frameB: Frame;
    availableFirstTick: number;
    availableLastTick: number;
};
export type FixedStepInterpolatorOptions = InterpolationDelayPolicyOptions & PlaybackCursorOptions;
export declare class FixedStepInterpolator {
    client: Client;
    options: ResolvedInterpolationDelayPolicyOptions & ResolvedPlaybackCursorOptions;
    private delayPolicy;
    private playbackCursor;
    constructor(client: Client, options?: FixedStepInterpolatorOptions);
    resetTimeline(): void;
    get tickMs(): number;
    getRenderTimestamp(interpDelay: number, now?: number): number;
    getTargetTick(interpDelay: number, now?: number): number;
    getBounds(interpDelay: number, now?: number): InterpolationBounds | null;
    getSampleDiagnostics(interpDelay: number, now?: number): InterpolationDiagnostics;
    sample(interpDelay: number, now?: number): InterpolationSample;
    sampleEntities(nids: Iterable<number>, interpDelay: number, now?: number): InterpolationSample;
    getEntity(nid: number, interpDelay: number, now?: number): IEntity | null;
    getEntities(nids: Iterable<number>, interpDelay: number, now?: number): Map<number, IEntity>;
    private getEntitiesWithinBounds;
    getAllEntities(interpDelay: number, now?: number): Map<number, IEntity>;
    getState(interpDelay: number, now?: number): InterpolatedState | null;
    private findFrameAIndex;
    private getEntityRefAtFrame;
    private getEntityRefsAtFrame;
    private cloneEntities;
    private interpolateEntity;
    private cloneEntity;
    private cloneProp;
}
export type StaticInterpolatorOptions = Omit<FixedStepInterpolatorOptions, 'delay' | 'adaptiveDelay'>;
export declare class StaticInterpolator extends FixedStepInterpolator {
    constructor(client: Client, options?: StaticInterpolatorOptions);
}
export type AdaptiveInterpolatorOptions = Omit<FixedStepInterpolatorOptions, 'delay' | 'adaptiveDelay' | 'adaptiveWindowFrames' | 'adaptiveSafetyTicks' | 'minDelayMs' | 'maxDelayMs' | 'adaptiveMaxSampleGapMs' | 'adaptiveDecreaseStableMs' | 'adaptiveDecreaseStepMs' | 'adaptiveStableThresholdMs'> & {
    windowFrames?: number;
    safetyTicks?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    maxSampleGapMs?: number;
    decreaseStableMs?: number;
    decreaseStepMs?: number;
    stableThresholdMs?: number;
};
export declare class AdaptiveInterpolator extends FixedStepInterpolator {
    constructor(client: Client, options?: AdaptiveInterpolatorOptions);
}
//# sourceMappingURL=FixedStepInterpolator.d.ts.map