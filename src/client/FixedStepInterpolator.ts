import { IEntity } from '../common/IEntity'
import { Client } from './Client'
import { Frame } from './Frame'
import {
    AdaptiveDelayPolicy,
    InterpolationDelayPolicy,
    InterpolationDelayPolicyOptions,
    ResolvedInterpolationDelayPolicyOptions,
    StaticDelayPolicy,
    resolveInterpolationDelayPolicyOptions
} from './InterpolationDelayPolicy'
import { PlaybackCursor, PlaybackCursorOptions, ResolvedPlaybackCursorOptions, resolvePlaybackCursorOptions } from './PlaybackCursor'

export enum InterpolationStatus {
    Ok = 'ok',
    InsufficientHistory = 'insufficient-history',
    BeforeHistory = 'before-history',
    AfterLatestFrame = 'after-latest-frame'
}

export type InterpolationBounds = {
    frameA: Frame
    frameB: Frame
    alpha: number
    targetTick: number
    targetFrameTick: number
    availableFirstTick: number
    availableLastTick: number
    desiredBufferMs: number
    latestBufferMs: number
    bufferErrorMs: number
    desiredBufferTicks: number
    latestBufferTicks: number
    bufferErrorTicks: number
}

export type InterpolationDiagnostics = {
    status: InterpolationStatus
    targetTick: number
    targetFrameTick: number
    alpha: number
    frameA: Frame | null
    frameB: Frame | null
    availableFirstTick: number | null
    availableLastTick: number | null
    desiredBufferMs: number
    latestBufferMs: number | null
    bufferErrorMs: number | null
    desiredBufferTicks: number
    latestBufferTicks: number | null
    bufferErrorTicks: number | null
}

export type InterpolationSample = InterpolationDiagnostics & {
    entities: Map<number, IEntity>
}

export type InterpolatedState = InterpolationSample & {
    status: InterpolationStatus.Ok
    frameA: Frame
    frameB: Frame
    availableFirstTick: number
    availableLastTick: number
}

export type FixedStepInterpolatorOptions = InterpolationDelayPolicyOptions & PlaybackCursorOptions

export class FixedStepInterpolator {
    client: Client
    options: ResolvedInterpolationDelayPolicyOptions & ResolvedPlaybackCursorOptions
    private delayPolicy: InterpolationDelayPolicy
    private playbackCursor: PlaybackCursor

    constructor(client: Client, options: FixedStepInterpolatorOptions = {}) {
        this.client = client
        const delayOptions = resolveInterpolationDelayPolicyOptions(options, this.tickMs)
        const playbackOptions = resolvePlaybackCursorOptions(options)
        this.options = { ...delayOptions, ...playbackOptions }
        this.delayPolicy = this.options.mode === 'adaptive'
            ? new AdaptiveDelayPolicy(delayOptions, this.tickMs)
            : new StaticDelayPolicy()
        this.playbackCursor = new PlaybackCursor(playbackOptions)
    }

    resetTimeline() {
        this.playbackCursor.reset()
        this.delayPolicy.reset()
    }

    get tickMs() {
        return 1000 / this.client.serverTickRate
    }

    getRenderTimestamp(interpDelay: number, now = Date.now()) {
        return now - interpDelay
    }

    getTargetTick(interpDelay: number, now = Date.now()) {
        const diagnostics = this.getSampleDiagnostics(interpDelay, now)
        return diagnostics.targetTick
    }

    getBounds(interpDelay: number, now = Date.now()): InterpolationBounds | null {
        const sample = this.getSampleDiagnostics(interpDelay, now)
        if (sample.status !== InterpolationStatus.Ok || !sample.frameA || !sample.frameB) {
            return null
        }
        return {
            frameA: sample.frameA,
            frameB: sample.frameB,
            alpha: sample.alpha,
            targetTick: sample.targetTick,
            targetFrameTick: sample.targetFrameTick,
            availableFirstTick: sample.availableFirstTick!,
            availableLastTick: sample.availableLastTick!,
            desiredBufferMs: sample.desiredBufferMs,
            latestBufferMs: sample.latestBufferMs!,
            bufferErrorMs: sample.bufferErrorMs!,
            desiredBufferTicks: sample.desiredBufferTicks,
            latestBufferTicks: sample.latestBufferTicks!,
            bufferErrorTicks: sample.bufferErrorTicks!
        }
    }

    getSampleDiagnostics(interpDelay: number, now = Date.now()): InterpolationDiagnostics {
        const frames = this.client.network.frames
        const first = frames[0] || null
        const last = frames[frames.length - 1] || null
        const availableFirstTick = first ? first.tick : null
        const availableLastTick = last ? last.tick : null
        const desiredBufferMs = this.delayPolicy.getDelayMs(interpDelay, frames, now)
        const desiredBufferTicks = desiredBufferMs / this.tickMs
        let latestBufferTicks: number | null = null
        let bufferErrorTicks: number | null = null
        let latestBufferMs: number | null = null
        let bufferErrorMs: number | null = null

        if (frames.length < 2) {
            this.resetTimeline()
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
            }
        }

        const targetTick = this.playbackCursor.advance(availableLastTick!, desiredBufferTicks, this.tickMs, now)
        latestBufferTicks = availableLastTick! - targetTick
        bufferErrorTicks = latestBufferTicks - desiredBufferTicks
        latestBufferMs = latestBufferTicks * this.tickMs
        bufferErrorMs = bufferErrorTicks * this.tickMs
        const estimatedTargetTick = targetTick
        const estimatedTargetFrameTick = Math.floor(estimatedTargetTick)

        if (targetTick < availableFirstTick!) {
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
            }
        }

        const frameAIndex = this.findFrameAIndex(frames, targetTick)
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
            }
        }
        const frameA = frames[frameAIndex]

        const nextFrame = frames[frameAIndex + 1] || null
        const frameB = nextFrame?.tick === frameA.tick + 1 ? nextFrame : null
        if (!frameB) {
            const targetFrameTick = Math.floor(targetTick)
            const alpha = targetTick - targetFrameTick
            if (targetTick >= availableLastTick!) {
                return {
                    status: InterpolationStatus.Ok,
                    targetTick,
                    targetFrameTick: availableLastTick!,
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
                }
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
            }
        }

        const alpha = targetTick - frameA.tick
        const targetFrameTick = frameA.tick

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
        }
    }

    sample(interpDelay: number, now = Date.now()): InterpolationSample {
        const diagnostics = this.getSampleDiagnostics(interpDelay, now)
        if (diagnostics.status !== InterpolationStatus.Ok || !diagnostics.frameA || !diagnostics.frameB) {
            return {
                ...diagnostics,
                entities: new Map()
            }
        }

        const entitiesA = this.getEntityRefsAtFrame(diagnostics.frameA)
        if (diagnostics.frameA === diagnostics.frameB) {
            return {
                ...diagnostics,
                entities: this.cloneEntities(entitiesA)
            }
        }

        const entitiesB = this.getEntityRefsAtFrame(diagnostics.frameB)
        const entities = new Map<number, IEntity>()

        entitiesA.forEach((entityA, nid) => {
            const entityB = entitiesB.get(nid)
            entities.set(nid, this.interpolateEntity(entityA, entityB || null, diagnostics.alpha))
        })

        return {
            ...diagnostics,
            entities
        }
    }

    sampleEntities(nids: Iterable<number>, interpDelay: number, now = Date.now()): InterpolationSample {
        const diagnostics = this.getSampleDiagnostics(interpDelay, now)
        if (diagnostics.status !== InterpolationStatus.Ok || !diagnostics.frameA || !diagnostics.frameB) {
            return {
                ...diagnostics,
                entities: new Map()
            }
        }

        const entities = this.getEntitiesWithinBounds(nids, diagnostics.frameA, diagnostics.frameB, diagnostics.alpha)
        return {
            ...diagnostics,
            entities
        }
    }

    getEntity(nid: number, interpDelay: number, now = Date.now()): IEntity | null {
        const bounds = this.getBounds(interpDelay, now)
        if (!bounds) {
            return null
        }

        const entityA = this.getEntityRefAtFrame(nid, bounds.frameA)
        if (!entityA) {
            return null
        }

        if (bounds.frameA === bounds.frameB) {
            return this.cloneEntity(entityA)
        }
        const entityB = this.getEntityRefAtFrame(nid, bounds.frameB)
        return this.interpolateEntity(entityA, entityB, bounds.alpha)
    }

    getEntities(nids: Iterable<number>, interpDelay: number, now = Date.now()): Map<number, IEntity> {
        const bounds = this.getBounds(interpDelay, now)
        if (!bounds) {
            return new Map()
        }

        return this.getEntitiesWithinBounds(nids, bounds.frameA, bounds.frameB, bounds.alpha)
    }

    private getEntitiesWithinBounds(nids: Iterable<number>, frameA: Frame, frameB: Frame, alpha: number) {
        const entities = new Map<number, IEntity>()

        for (const nid of nids) {
            const entityA = this.getEntityRefAtFrame(nid, frameA)
            if (!entityA) {
                continue
            }

            if (frameA === frameB) {
                entities.set(nid, this.cloneEntity(entityA))
                continue
            }

            const entityB = this.getEntityRefAtFrame(nid, frameB)
            entities.set(nid, this.interpolateEntity(entityA, entityB, alpha))
        }

        return entities
    }

    getAllEntities(interpDelay: number, now = Date.now()): Map<number, IEntity> {
        return this.sample(interpDelay, now).entities
    }

    getState(interpDelay: number, now = Date.now()): InterpolatedState | null {
        const sample = this.sample(interpDelay, now)
        if (sample.status !== InterpolationStatus.Ok || !sample.frameA || !sample.frameB) {
            return null
        }
        return sample as InterpolatedState
    }

    private findFrameAIndex(frames: Frame[], targetTick: number): number {
        let frameAIndex = -1
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i]
            if (frame.tick <= targetTick) {
                frameAIndex = i
            } else {
                break
            }
        }
        return frameAIndex
    }

    private getEntityRefAtFrame(nid: number, targetFrame: Frame): IEntity | null {
        return this.client.network.store.history.getEntityAtTickRef(nid, targetFrame.tick)
    }

    private getEntityRefsAtFrame(targetFrame: Frame): Map<number, IEntity> {
        return this.client.network.store.history.getVisibleEntitiesAtTickRefs(targetFrame.tick)
    }

    private cloneEntities(entities: Map<number, IEntity>) {
        const clones = new Map<number, IEntity>()
        entities.forEach((entity, nid) => {
            clones.set(nid, this.cloneEntity(entity))
        })
        return clones
    }

    private interpolateEntity(entityA: IEntity, entityB: IEntity | null, alpha: number): IEntity {
        const interpolated = this.cloneEntity(entityA)
        if (!entityB) {
            return interpolated
        }

        const schema = this.client.context.getSchema(entityA.ntype)
        schema.keys.forEach(propSpec => {
            const prop = propSpec.prop
            if (!(prop in entityB)) {
                return
            }
            if (propSpec.interp) {
                interpolated[prop] = propSpec.binary.interp(entityA[prop], entityB[prop], alpha)
            } else {
                interpolated[prop] = this.cloneProp(entityA.ntype, prop, entityB[prop])
            }
        })

        return interpolated
    }

    private cloneEntity(entity: IEntity): IEntity {
        const clone: IEntity = {
            nid: entity.nid,
            ntype: entity.ntype
        }
        const schema = this.client.context.getSchema(entity.ntype)
        schema.keys.forEach(propSpec => {
            clone[propSpec.prop] = this.cloneProp(entity.ntype, propSpec.prop, entity[propSpec.prop])
        })
        return clone
    }

    private cloneProp(ntype: number, prop: string, value: any) {
        const schema = this.client.context.getSchema(ntype)
        const propSpec = schema.props[prop]
        return propSpec.binary.clone(value)
    }
}

export type StaticInterpolatorOptions = Omit<FixedStepInterpolatorOptions, 'delay' | 'adaptiveDelay'>

export class StaticInterpolator extends FixedStepInterpolator {
    constructor(client: Client, options: StaticInterpolatorOptions = {}) {
        super(client, {
            ...options,
            delay: { mode: 'static' }
        })
    }
}

export type AdaptiveInterpolatorOptions = Omit<
    FixedStepInterpolatorOptions,
    | 'delay'
    | 'adaptiveDelay'
    | 'adaptiveWindowFrames'
    | 'adaptiveSafetyTicks'
    | 'minDelayMs'
    | 'maxDelayMs'
    | 'adaptiveMaxSampleGapMs'
    | 'adaptiveDecreaseStableMs'
    | 'adaptiveDecreaseStepMs'
    | 'adaptiveStableThresholdMs'
> & {
    windowFrames?: number
    safetyTicks?: number
    minDelayMs?: number
    maxDelayMs?: number
    maxSampleGapMs?: number
    decreaseStableMs?: number
    decreaseStepMs?: number
    stableThresholdMs?: number
}

export class AdaptiveInterpolator extends FixedStepInterpolator {
    constructor(client: Client, options: AdaptiveInterpolatorOptions = {}) {
        const {
            windowFrames,
            safetyTicks,
            minDelayMs,
            maxDelayMs,
            maxSampleGapMs,
            decreaseStableMs,
            decreaseStepMs,
            stableThresholdMs,
            ...playbackOptions
        } = options

        super(client, {
            ...playbackOptions,
            delay: {
                mode: 'adaptive',
                windowFrames,
                safetyTicks,
                minMs: minDelayMs,
                maxMs: maxDelayMs,
                maxSampleGapMs,
                decreaseStableMs,
                decreaseStepMs,
                stableThresholdMs
            }
        })
    }
}
