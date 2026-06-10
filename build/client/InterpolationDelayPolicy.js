"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveDelayPolicy = exports.StaticDelayPolicy = void 0;
exports.resolveInterpolationDelayPolicyOptions = resolveInterpolationDelayPolicyOptions;
function resolveInterpolationDelayPolicyOptions(options, tickMs) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    const delay = options.delay;
    const adaptiveDelay = delay ? delay.mode === 'adaptive' : (_a = options.adaptiveDelay) !== null && _a !== void 0 ? _a : false;
    const adaptive = (delay === null || delay === void 0 ? void 0 : delay.mode) === 'adaptive' ? delay : null;
    return {
        mode: adaptiveDelay ? 'adaptive' : 'static',
        windowFrames: (_c = (_b = adaptive === null || adaptive === void 0 ? void 0 : adaptive.windowFrames) !== null && _b !== void 0 ? _b : options.adaptiveWindowFrames) !== null && _c !== void 0 ? _c : 20,
        safetyTicks: (_e = (_d = adaptive === null || adaptive === void 0 ? void 0 : adaptive.safetyTicks) !== null && _d !== void 0 ? _d : options.adaptiveSafetyTicks) !== null && _e !== void 0 ? _e : 0.25,
        minMs: (_g = (_f = adaptive === null || adaptive === void 0 ? void 0 : adaptive.minMs) !== null && _f !== void 0 ? _f : options.minDelayMs) !== null && _g !== void 0 ? _g : 0,
        maxMs: (_j = (_h = adaptive === null || adaptive === void 0 ? void 0 : adaptive.maxMs) !== null && _h !== void 0 ? _h : options.maxDelayMs) !== null && _j !== void 0 ? _j : Number.POSITIVE_INFINITY,
        maxSampleGapMs: (_l = (_k = adaptive === null || adaptive === void 0 ? void 0 : adaptive.maxSampleGapMs) !== null && _k !== void 0 ? _k : options.adaptiveMaxSampleGapMs) !== null && _l !== void 0 ? _l : (tickMs * 4),
        decreaseStableMs: (_o = (_m = adaptive === null || adaptive === void 0 ? void 0 : adaptive.decreaseStableMs) !== null && _m !== void 0 ? _m : options.adaptiveDecreaseStableMs) !== null && _o !== void 0 ? _o : 30000,
        decreaseStepMs: (_q = (_p = adaptive === null || adaptive === void 0 ? void 0 : adaptive.decreaseStepMs) !== null && _p !== void 0 ? _p : options.adaptiveDecreaseStepMs) !== null && _q !== void 0 ? _q : 5,
        stableThresholdMs: (_s = (_r = adaptive === null || adaptive === void 0 ? void 0 : adaptive.stableThresholdMs) !== null && _r !== void 0 ? _r : options.adaptiveStableThresholdMs) !== null && _s !== void 0 ? _s : 2
    };
}
class StaticDelayPolicy {
    getDelayMs(requestedDelayMs) {
        return requestedDelayMs;
    }
    reset() {
    }
}
exports.StaticDelayPolicy = StaticDelayPolicy;
class AdaptiveDelayPolicy {
    constructor(options, tickMs) {
        this.activeDelayMs = null;
        this.stableDelaySince = null;
        this.options = options;
        this.tickMs = tickMs;
    }
    getDelayMs(_requestedDelayMs, frames, now) {
        const maxGapMs = this.getMaxUsableFrameGapMs(frames);
        const excessGapMs = Math.max(0, maxGapMs - this.tickMs);
        const measuredDelayMs = maxGapMs > 0
            ? this.options.minMs + excessGapMs + (this.options.safetyTicks * this.tickMs)
            : this.options.minMs;
        const clampedMeasuredDelayMs = Math.max(this.options.minMs, Math.min(this.options.maxMs, measuredDelayMs));
        if (this.activeDelayMs === null) {
            this.activeDelayMs = clampedMeasuredDelayMs;
            this.stableDelaySince = null;
            return this.activeDelayMs;
        }
        if (clampedMeasuredDelayMs > this.activeDelayMs + this.options.stableThresholdMs) {
            this.activeDelayMs = clampedMeasuredDelayMs;
            this.stableDelaySince = null;
            return this.activeDelayMs;
        }
        if (clampedMeasuredDelayMs < this.activeDelayMs - this.options.stableThresholdMs) {
            if (this.stableDelaySince === null) {
                this.stableDelaySince = now;
            }
            else if (now - this.stableDelaySince >= this.options.decreaseStableMs) {
                this.activeDelayMs = Math.max(clampedMeasuredDelayMs, this.activeDelayMs - this.options.decreaseStepMs);
                this.stableDelaySince = now;
            }
        }
        else {
            this.stableDelaySince = null;
        }
        return this.activeDelayMs;
    }
    reset() {
        this.activeDelayMs = null;
        this.stableDelaySince = null;
    }
    getMaxUsableFrameGapMs(frames) {
        const windowSize = Math.max(2, this.options.windowFrames);
        const start = Math.max(1, frames.length - windowSize);
        let maxGapMs = 0;
        for (let i = start; i < frames.length; i++) {
            const gapMs = frames[i].receivedAt - frames[i - 1].receivedAt;
            if (gapMs > this.options.maxSampleGapMs) {
                continue;
            }
            maxGapMs = Math.max(maxGapMs, gapMs);
        }
        return maxGapMs;
    }
}
exports.AdaptiveDelayPolicy = AdaptiveDelayPolicy;
