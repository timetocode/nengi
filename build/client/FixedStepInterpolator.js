"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveInterpolator = exports.StaticInterpolator = exports.FixedStepInterpolator = exports.InterpolationStatus = void 0;
const InterpolationDelayPolicy_1 = require("./InterpolationDelayPolicy");
const PlaybackCursor_1 = require("./PlaybackCursor");
var InterpolationStatus;
(function (InterpolationStatus) {
    InterpolationStatus["Ok"] = "ok";
    InterpolationStatus["InsufficientHistory"] = "insufficient-history";
    InterpolationStatus["BeforeHistory"] = "before-history";
    InterpolationStatus["AfterLatestFrame"] = "after-latest-frame";
})(InterpolationStatus || (exports.InterpolationStatus = InterpolationStatus = {}));
class FixedStepInterpolator {
    constructor(client, options = {}) {
        this.client = client;
        const delayOptions = (0, InterpolationDelayPolicy_1.resolveInterpolationDelayPolicyOptions)(options, this.tickMs);
        const playbackOptions = (0, PlaybackCursor_1.resolvePlaybackCursorOptions)(options);
        this.options = Object.assign(Object.assign({}, delayOptions), playbackOptions);
        this.delayPolicy = this.options.mode === 'adaptive'
            ? new InterpolationDelayPolicy_1.AdaptiveDelayPolicy(delayOptions, this.tickMs)
            : new InterpolationDelayPolicy_1.StaticDelayPolicy();
        this.playbackCursor = new PlaybackCursor_1.PlaybackCursor(playbackOptions);
    }
    resetTimeline() {
        this.playbackCursor.reset();
        this.delayPolicy.reset();
    }
    get tickMs() {
        return 1000 / this.client.serverTickRate;
    }
    getRenderTimestamp(interpDelay, now = Date.now()) {
        return now - interpDelay;
    }
    getTargetTick(interpDelay, now = Date.now()) {
        const diagnostics = this.getSampleDiagnostics(interpDelay, now);
        return diagnostics.targetTick;
    }
    getBounds(interpDelay, now = Date.now()) {
        const sample = this.getSampleDiagnostics(interpDelay, now);
        if (sample.status !== InterpolationStatus.Ok || !sample.frameA || !sample.frameB) {
            return null;
        }
        return {
            frameA: sample.frameA,
            frameB: sample.frameB,
            alpha: sample.alpha,
            targetTick: sample.targetTick,
            targetFrameTick: sample.targetFrameTick,
            availableFirstTick: sample.availableFirstTick,
            availableLastTick: sample.availableLastTick,
            desiredBufferMs: sample.desiredBufferMs,
            latestBufferMs: sample.latestBufferMs,
            bufferErrorMs: sample.bufferErrorMs,
            desiredBufferTicks: sample.desiredBufferTicks,
            latestBufferTicks: sample.latestBufferTicks,
            bufferErrorTicks: sample.bufferErrorTicks
        };
    }
    getSampleDiagnostics(interpDelay, now = Date.now()) {
        const frames = this.client.network.frames;
        const first = frames[0] || null;
        const last = frames[frames.length - 1] || null;
        const availableFirstTick = first ? first.tick : null;
        const availableLastTick = last ? last.tick : null;
        const desiredBufferMs = this.delayPolicy.getDelayMs(interpDelay, frames, now);
        const desiredBufferTicks = desiredBufferMs / this.tickMs;
        let latestBufferTicks = null;
        let bufferErrorTicks = null;
        let latestBufferMs = null;
        let bufferErrorMs = null;
        if (frames.length < 2) {
            this.resetTimeline();
            return {
                status: InterpolationStatus.InsufficientHistory,
                targetTick: Number.NEGATIVE_INFINITY,
                targetFrameTick: Number.NEGATIVE_INFINITY,
                alpha: 0,
                frameA: null,
                frameB: null,
                availableFirstTick,
                availableLastTick,
                desiredBufferMs,
                latestBufferMs,
                bufferErrorMs,
                desiredBufferTicks,
                latestBufferTicks: null,
                bufferErrorTicks: null
            };
        }
        const targetTick = this.playbackCursor.advance(availableLastTick, desiredBufferTicks, this.tickMs, now);
        latestBufferTicks = availableLastTick - targetTick;
        bufferErrorTicks = latestBufferTicks - desiredBufferTicks;
        latestBufferMs = latestBufferTicks * this.tickMs;
        bufferErrorMs = bufferErrorTicks * this.tickMs;
        const estimatedTargetTick = targetTick;
        const estimatedTargetFrameTick = Math.floor(estimatedTargetTick);
        if (targetTick < availableFirstTick) {
            return {
                status: InterpolationStatus.BeforeHistory,
                targetTick: estimatedTargetTick,
                targetFrameTick: estimatedTargetFrameTick,
                alpha: Number.isFinite(estimatedTargetTick) ? estimatedTargetTick - estimatedTargetFrameTick : 0,
                frameA: null,
                frameB: null,
                availableFirstTick,
                availableLastTick,
                desiredBufferMs,
                latestBufferMs,
                bufferErrorMs,
                desiredBufferTicks,
                latestBufferTicks,
                bufferErrorTicks
            };
        }
        const frameAIndex = this.findFrameAIndex(frames, targetTick);
        if (frameAIndex === -1) {
            return {
                status: InterpolationStatus.BeforeHistory,
                targetTick: estimatedTargetTick,
                targetFrameTick: estimatedTargetFrameTick,
                alpha: Number.isFinite(estimatedTargetTick) ? estimatedTargetTick - estimatedTargetFrameTick : 0,
                frameA: null,
                frameB: null,
                availableFirstTick,
                availableLastTick,
                desiredBufferMs,
                latestBufferMs,
                bufferErrorMs,
                desiredBufferTicks,
                latestBufferTicks: null,
                bufferErrorTicks: null
            };
        }
        const frameA = frames[frameAIndex];
        const nextFrame = frames[frameAIndex + 1] || null;
        const frameB = (nextFrame === null || nextFrame === void 0 ? void 0 : nextFrame.tick) === frameA.tick + 1 ? nextFrame : null;
        if (!frameB) {
            const targetFrameTick = Math.floor(targetTick);
            const alpha = targetTick - targetFrameTick;
            if (targetTick >= availableLastTick) {
                return {
                    status: InterpolationStatus.Ok,
                    targetTick,
                    targetFrameTick: availableLastTick,
                    alpha: 0,
                    frameA: frameA,
                    frameB: frameA,
                    availableFirstTick,
                    availableLastTick,
                    desiredBufferMs,
                    latestBufferMs,
                    bufferErrorMs,
                    desiredBufferTicks,
                    latestBufferTicks,
                    bufferErrorTicks
                };
            }
            return {
                status: InterpolationStatus.AfterLatestFrame,
                targetTick,
                targetFrameTick,
                alpha,
                frameA: null,
                frameB: null,
                availableFirstTick,
                availableLastTick,
                desiredBufferMs,
                latestBufferMs,
                bufferErrorMs,
                desiredBufferTicks,
                latestBufferTicks,
                bufferErrorTicks
            };
        }
        const alpha = targetTick - frameA.tick;
        const targetFrameTick = frameA.tick;
        return {
            status: InterpolationStatus.Ok,
            targetTick,
            targetFrameTick,
            alpha,
            frameA,
            frameB,
            availableFirstTick,
            availableLastTick,
            desiredBufferMs,
            latestBufferMs,
            bufferErrorMs,
            desiredBufferTicks,
            latestBufferTicks,
            bufferErrorTicks
        };
    }
    sample(interpDelay, now = Date.now()) {
        const diagnostics = this.getSampleDiagnostics(interpDelay, now);
        if (diagnostics.status !== InterpolationStatus.Ok || !diagnostics.frameA || !diagnostics.frameB) {
            return Object.assign(Object.assign({}, diagnostics), { entities: new Map() });
        }
        const entitiesA = this.getEntityRefsAtFrame(diagnostics.frameA);
        if (diagnostics.frameA === diagnostics.frameB) {
            return Object.assign(Object.assign({}, diagnostics), { entities: this.cloneEntities(entitiesA) });
        }
        const entitiesB = this.getEntityRefsAtFrame(diagnostics.frameB);
        const entities = new Map();
        entitiesA.forEach((entityA, nid) => {
            const entityB = entitiesB.get(nid);
            entities.set(nid, this.interpolateEntity(entityA, entityB || null, diagnostics.alpha));
        });
        return Object.assign(Object.assign({}, diagnostics), { entities });
    }
    sampleEntities(nids, interpDelay, now = Date.now()) {
        const diagnostics = this.getSampleDiagnostics(interpDelay, now);
        if (diagnostics.status !== InterpolationStatus.Ok || !diagnostics.frameA || !diagnostics.frameB) {
            return Object.assign(Object.assign({}, diagnostics), { entities: new Map() });
        }
        const entities = this.getEntitiesWithinBounds(nids, diagnostics.frameA, diagnostics.frameB, diagnostics.alpha);
        return Object.assign(Object.assign({}, diagnostics), { entities });
    }
    getEntity(nid, interpDelay, now = Date.now()) {
        const bounds = this.getBounds(interpDelay, now);
        if (!bounds) {
            return null;
        }
        const entityA = this.getEntityRefAtFrame(nid, bounds.frameA);
        if (!entityA) {
            return null;
        }
        if (bounds.frameA === bounds.frameB) {
            return this.cloneEntity(entityA);
        }
        const entityB = this.getEntityRefAtFrame(nid, bounds.frameB);
        return this.interpolateEntity(entityA, entityB, bounds.alpha);
    }
    getEntities(nids, interpDelay, now = Date.now()) {
        const bounds = this.getBounds(interpDelay, now);
        if (!bounds) {
            return new Map();
        }
        return this.getEntitiesWithinBounds(nids, bounds.frameA, bounds.frameB, bounds.alpha);
    }
    getEntitiesWithinBounds(nids, frameA, frameB, alpha) {
        const entities = new Map();
        for (const nid of nids) {
            const entityA = this.getEntityRefAtFrame(nid, frameA);
            if (!entityA) {
                continue;
            }
            if (frameA === frameB) {
                entities.set(nid, this.cloneEntity(entityA));
                continue;
            }
            const entityB = this.getEntityRefAtFrame(nid, frameB);
            entities.set(nid, this.interpolateEntity(entityA, entityB, alpha));
        }
        return entities;
    }
    getAllEntities(interpDelay, now = Date.now()) {
        return this.sample(interpDelay, now).entities;
    }
    getState(interpDelay, now = Date.now()) {
        const sample = this.sample(interpDelay, now);
        if (sample.status !== InterpolationStatus.Ok || !sample.frameA || !sample.frameB) {
            return null;
        }
        return sample;
    }
    findFrameAIndex(frames, targetTick) {
        let frameAIndex = -1;
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (frame.tick <= targetTick) {
                frameAIndex = i;
            }
            else {
                break;
            }
        }
        return frameAIndex;
    }
    getEntityRefAtFrame(nid, targetFrame) {
        return this.client.network.store.history.getEntityAtTickRef(nid, targetFrame.tick);
    }
    getEntityRefsAtFrame(targetFrame) {
        return this.client.network.store.history.getVisibleEntitiesAtTickRefs(targetFrame.tick);
    }
    cloneEntities(entities) {
        const clones = new Map();
        entities.forEach((entity, nid) => {
            clones.set(nid, this.cloneEntity(entity));
        });
        return clones;
    }
    interpolateEntity(entityA, entityB, alpha) {
        const interpolated = this.cloneEntity(entityA);
        if (!entityB) {
            return interpolated;
        }
        const schema = this.client.context.getSchema(entityA.ntype);
        schema.keys.forEach(propSpec => {
            const prop = propSpec.prop;
            if (!(prop in entityB)) {
                return;
            }
            if (propSpec.interp) {
                interpolated[prop] = propSpec.binary.interp(entityA[prop], entityB[prop], alpha);
            }
            else {
                interpolated[prop] = this.cloneProp(entityA.ntype, prop, entityB[prop]);
            }
        });
        return interpolated;
    }
    cloneEntity(entity) {
        const clone = {
            nid: entity.nid,
            ntype: entity.ntype
        };
        const schema = this.client.context.getSchema(entity.ntype);
        schema.keys.forEach(propSpec => {
            clone[propSpec.prop] = this.cloneProp(entity.ntype, propSpec.prop, entity[propSpec.prop]);
        });
        return clone;
    }
    cloneProp(ntype, prop, value) {
        const schema = this.client.context.getSchema(ntype);
        const propSpec = schema.props[prop];
        return propSpec.binary.clone(value);
    }
}
exports.FixedStepInterpolator = FixedStepInterpolator;
class StaticInterpolator extends FixedStepInterpolator {
    constructor(client, options = {}) {
        super(client, Object.assign(Object.assign({}, options), { delay: { mode: 'static' } }));
    }
}
exports.StaticInterpolator = StaticInterpolator;
class AdaptiveInterpolator extends FixedStepInterpolator {
    constructor(client, options = {}) {
        const { windowFrames, safetyTicks, minDelayMs, maxDelayMs, maxSampleGapMs, decreaseStableMs, decreaseStepMs, stableThresholdMs } = options, playbackOptions = __rest(options, ["windowFrames", "safetyTicks", "minDelayMs", "maxDelayMs", "maxSampleGapMs", "decreaseStableMs", "decreaseStepMs", "stableThresholdMs"]);
        super(client, Object.assign(Object.assign({}, playbackOptions), { delay: {
                mode: 'adaptive',
                windowFrames,
                safetyTicks,
                minMs: minDelayMs,
                maxMs: maxDelayMs,
                maxSampleGapMs,
                decreaseStableMs,
                decreaseStepMs,
                stableThresholdMs
            } }));
    }
}
exports.AdaptiveInterpolator = AdaptiveInterpolator;
