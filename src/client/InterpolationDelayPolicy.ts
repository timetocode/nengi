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

export type InterpolationDelayPolicyOptions = {
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
    const adaptive = delay?.mode === 'adaptive' ? delay : null
    const minMs = Math.max(0, adaptive?.minMs ?? 0)
    const maxMs = Math.max(minMs, adaptive?.maxMs ?? Number.POSITIVE_INFINITY)
    return {
        mode: adaptive ? 'adaptive' : 'static',
        windowFrames: Math.max(2, Math.floor(adaptive?.windowFrames ?? 20)),
        safetyTicks: Math.max(0, adaptive?.safetyTicks ?? 0.25),
        minMs,
        maxMs,
        maxSampleGapMs: Math.max(1, adaptive?.maxSampleGapMs ?? (tickMs * 4)),
        decreaseStableMs: Math.max(0, adaptive?.decreaseStableMs ?? 30000),
        decreaseStepMs: Math.max(0, adaptive?.decreaseStepMs ?? 5),
        stableThresholdMs: Math.max(0, adaptive?.stableThresholdMs ?? 2)
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
            const gapMs = frames[i].receivedAtMs - frames[i - 1].receivedAtMs
            if (gapMs > this.options.maxSampleGapMs) {
                continue
            }
            maxGapMs = Math.max(maxGapMs, gapMs)
        }

        return maxGapMs
    }
}
