"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaybackCursor = void 0;
exports.resolvePlaybackCursorOptions = resolvePlaybackCursorOptions;
function resolvePlaybackCursorOptions(options) {
    var _a, _b, _c, _d;
    return {
        correctionDeadbandTicks: (_a = options.correctionDeadbandTicks) !== null && _a !== void 0 ? _a : 0.1,
        correctionGain: (_b = options.correctionGain) !== null && _b !== void 0 ? _b : 0.2,
        maxCorrectionRate: (_c = options.maxCorrectionRate) !== null && _c !== void 0 ? _c : 0.1,
        snapThresholdTicks: (_d = options.snapThresholdTicks) !== null && _d !== void 0 ? _d : 2
    };
}
class PlaybackCursor {
    constructor(options) {
        this.playbackTick = null;
        this.lastSampleNow = null;
        this.options = options;
    }
    reset() {
        this.playbackTick = null;
        this.lastSampleNow = null;
    }
    advance(availableLastTick, desiredBufferTicks, tickMs, now) {
        const targetPlaybackTick = availableLastTick - desiredBufferTicks;
        if (this.playbackTick === null || this.lastSampleNow === null) {
            this.playbackTick = targetPlaybackTick;
            this.lastSampleNow = now;
            return this.playbackTick;
        }
        const elapsedTicks = Math.max(0, now - this.lastSampleNow) / tickMs;
        const projectedPlaybackTick = this.playbackTick + elapsedTicks;
        const errorTicks = targetPlaybackTick - projectedPlaybackTick;
        if (errorTicks >= this.options.snapThresholdTicks) {
            this.playbackTick = targetPlaybackTick;
            this.lastSampleNow = now;
            return this.playbackTick;
        }
        let playbackRate = 1;
        if (errorTicks > this.options.correctionDeadbandTicks) {
            const correction = Math.min(this.options.maxCorrectionRate, errorTicks * this.options.correctionGain);
            playbackRate += correction;
        }
        this.playbackTick = Math.min(availableLastTick, this.playbackTick + (elapsedTicks * playbackRate));
        this.lastSampleNow = now;
        return this.playbackTick;
    }
}
exports.PlaybackCursor = PlaybackCursor;
