import { Frame } from './Frame'

export type StaticInterpolationDelayConfig = {
    mode: 'static'
}

export type AdaptiveInterpolationDelayConfig = {
    mode: 'adaptive'
    windowFrames?: number
    safetyTicks?: number
    minMs?: number
    maxMs?: number
    maxSampleGapMs?: number
    decreaseStableMs?: number
    decreaseStepMs?: number
    stableThresholdMs?: number
}

export type InterpolationDelayConfig = StaticInterpolationDelayConfig | AdaptiveInterpolationDelayConfig

export type LegacyInterpolationDelayPolicyOptions = {
    adaptiveDelay?: boolean
    adaptiveWindowFrames?: number
    adaptiveSafetyTicks?: number
    minDelayMs?: number
    maxDelayMs?: number
    adaptiveMaxSampleGapMs?: number
    adaptiveDecreaseStableMs?: number
    adaptiveDecreaseStepMs?: number
    adaptiveStableThresholdMs?: number
}

export type InterpolationDelayPolicyOptions = LegacyInterpolationDelayPolicyOptions & {
    delay?: InterpolationDelayConfig
}

export type ResolvedInterpolationDelayPolicyOptions = {
    mode: 'static' | 'adaptive'
    windowFrames: number
    safetyTicks: number
    minMs: number
    maxMs: number
    maxSampleGapMs: number
    decreaseStableMs: number
    decreaseStepMs: number
    stableThresholdMs: number
}

export interface InterpolationDelayPolicy {
    getDelayMs(requestedDelayMs: number, frames: Frame[], now: number): number
    reset(): void
}

export function resolveInterpolationDelayPolicyOptions(
    options: InterpolationDelayPolicyOptions,
    tickMs: number
): ResolvedInterpolationDelayPolicyOptions {
    const delay = options.delay
    const adaptiveDelay = delay ? delay.mode === 'adaptive' : options.adaptiveDelay ?? false
    const adaptive = delay?.mode === 'adaptive' ? delay : null
    return {
        mode: adaptiveDelay ? 'adaptive' : 'static',
        windowFrames: adaptive?.windowFrames ?? options.adaptiveWindowFrames ?? 20,
        safetyTicks: adaptive?.safetyTicks ?? options.adaptiveSafetyTicks ?? 0.25,
        minMs: adaptive?.minMs ?? options.minDelayMs ?? 0,
        maxMs: adaptive?.maxMs ?? options.maxDelayMs ?? Number.POSITIVE_INFINITY,
        maxSampleGapMs: adaptive?.maxSampleGapMs ?? options.adaptiveMaxSampleGapMs ?? (tickMs * 4),
        decreaseStableMs: adaptive?.decreaseStableMs ?? options.adaptiveDecreaseStableMs ?? 30000,
        decreaseStepMs: adaptive?.decreaseStepMs ?? options.adaptiveDecreaseStepMs ?? 5,
        stableThresholdMs: adaptive?.stableThresholdMs ?? options.adaptiveStableThresholdMs ?? 2
    }
}

export class StaticDelayPolicy implements InterpolationDelayPolicy {
    getDelayMs(requestedDelayMs: number) {
        return requestedDelayMs
    }

    reset() {
    }
}

export class AdaptiveDelayPolicy implements InterpolationDelayPolicy {
    private options: ResolvedInterpolationDelayPolicyOptions
    private tickMs: number
    private activeDelayMs: number | null = null
    private stableDelaySince: number | null = null

    constructor(options: ResolvedInterpolationDelayPolicyOptions, tickMs: number) {
        this.options = options
        this.tickMs = tickMs
    }

    getDelayMs(_requestedDelayMs: number, frames: Frame[], now: number) {
        const maxGapMs = this.getMaxUsableFrameGapMs(frames)
        const excessGapMs = Math.max(0, maxGapMs - this.tickMs)
        const measuredDelayMs = maxGapMs > 0
            ? this.options.minMs + excessGapMs + (this.options.safetyTicks * this.tickMs)
            : this.options.minMs
        const clampedMeasuredDelayMs = Math.max(
            this.options.minMs,
            Math.min(this.options.maxMs, measuredDelayMs)
        )

        if (this.activeDelayMs === null) {
            this.activeDelayMs = clampedMeasuredDelayMs
            this.stableDelaySince = null
            return this.activeDelayMs
        }

        if (clampedMeasuredDelayMs > this.activeDelayMs + this.options.stableThresholdMs) {
            this.activeDelayMs = clampedMeasuredDelayMs
            this.stableDelaySince = null
            return this.activeDelayMs
        }

        if (clampedMeasuredDelayMs < this.activeDelayMs - this.options.stableThresholdMs) {
            if (this.stableDelaySince === null) {
                this.stableDelaySince = now
            } else if (now - this.stableDelaySince >= this.options.decreaseStableMs) {
                this.activeDelayMs = Math.max(
                    clampedMeasuredDelayMs,
                    this.activeDelayMs - this.options.decreaseStepMs
                )
                this.stableDelaySince = now
            }
        } else {
            this.stableDelaySince = null
        }

        return this.activeDelayMs
    }

    reset() {
        this.activeDelayMs = null
        this.stableDelaySince = null
    }

    private getMaxUsableFrameGapMs(frames: Frame[]) {
        const windowSize = Math.max(2, this.options.windowFrames)
        const start = Math.max(1, frames.length - windowSize)
        let maxGapMs = 0

        for (let i = start; i < frames.length; i++) {
            const gapMs = frames[i].receivedAt - frames[i - 1].receivedAt
            if (gapMs > this.options.maxSampleGapMs) {
                continue
            }
            maxGapMs = Math.max(maxGapMs, gapMs)
        }

        return maxGapMs
    }
}
