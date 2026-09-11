export type PlaybackCursorOptions = {
    correctionDeadbandTicks?: number
    correctionGain?: number
    maxCorrectionRate?: number
    snapThresholdTicks?: number
}

export type ResolvedPlaybackCursorOptions = Required<PlaybackCursorOptions>

export function resolvePlaybackCursorOptions(options: PlaybackCursorOptions): ResolvedPlaybackCursorOptions {
    return {
        correctionDeadbandTicks: options.correctionDeadbandTicks ?? 0.1,
        correctionGain: options.correctionGain ?? 0.2,
        maxCorrectionRate: options.maxCorrectionRate ?? 0.1,
        snapThresholdTicks: options.snapThresholdTicks ?? 2
    }
}

export class PlaybackCursor {
    private options: ResolvedPlaybackCursorOptions
    private playbackTick: number | null = null
    private lastSampleNow: number | null = null

    constructor(options: ResolvedPlaybackCursorOptions) {
        this.options = options
    }

    reset() {
        this.playbackTick = null
        this.lastSampleNow = null
    }

    advance(availableLastTick: number, desiredBufferTicks: number, tickMs: number, now: number) {
        const targetPlaybackTick = availableLastTick - desiredBufferTicks
        if (this.playbackTick === null || this.lastSampleNow === null) {
            this.playbackTick = targetPlaybackTick
            this.lastSampleNow = now
            return this.playbackTick
        }

        const elapsedTicks = Math.max(0, now - this.lastSampleNow) / tickMs
        const projectedPlaybackTick = this.playbackTick + elapsedTicks
        const errorTicks = targetPlaybackTick - projectedPlaybackTick

        if (errorTicks >= this.options.snapThresholdTicks) {
            this.playbackTick = targetPlaybackTick
            this.lastSampleNow = now
            return this.playbackTick
        }

        let playbackRate = 1
        if (errorTicks > this.options.correctionDeadbandTicks) {
            const correction = Math.min(this.options.maxCorrectionRate, errorTicks * this.options.correctionGain)
            playbackRate += correction
        } else if (errorTicks < -this.options.correctionDeadbandTicks) {
            // A stall can exhaust the buffer. Slightly slower forward playback
            // lets it refill; running at 1x forever would stay at the frontier.
            const correction = Math.min(this.options.maxCorrectionRate, -errorTicks * this.options.correctionGain)
            playbackRate = Math.max(0, playbackRate - correction)
        }

        this.playbackTick = Math.min(availableLastTick, this.playbackTick + (elapsedTicks * playbackRate))
        this.lastSampleNow = now
        return this.playbackTick
    }
}
