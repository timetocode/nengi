import type { Context } from '../common/Context'
import type { IEntity } from '../common/IEntity'
import type { Frame } from './Frame'
import { InterpolationDiagnostics, InterpolationStatus } from './FixedStepInterpolator'
import { EntityTimeline, sampleEntityTimelines } from './entityTimeline'

/** Caller-owned presentation storage. Sampling into it overwrites the current values. */
export class InterpolationOutput implements InterpolationDiagnostics {
    status = InterpolationStatus.InsufficientHistory
    targetTick = Number.NEGATIVE_INFINITY
    targetFrameTick = Number.NEGATIVE_INFINITY
    alpha = 0
    frameA: Frame | null = null
    frameB: Frame | null = null
    availableFirstTick: number | null = null
    availableLastTick: number | null = null
    desiredBufferMs = 0
    latestBufferMs: number | null = null
    bufferErrorMs: number | null = null
    desiredBufferTicks = 0
    latestBufferTicks: number | null = null
    bufferErrorTicks: number | null = null

    private readonly values = new Map<number, IEntity>()
    private readonly seen = new Map<number, number>()
    private generation = 0
    private context: Context | null = null
    private sampling = false

    /** Membership is maintained by the sampler. Values are mutable presentation data. */
    readonly entities: ReadonlyMap<number, IEntity> = this.values

    /** Release current poses and frame references. The buffer can be sampled again. */
    clear() {
        if (this.sampling) throw new Error('Cannot clear an InterpolationOutput while it is being sampled.')
        this.values.clear()
        this.seen.clear()
        this.generation = 0
        this.context = null
        this.status = InterpolationStatus.InsufficientHistory
        this.targetTick = Number.NEGATIVE_INFINITY
        this.targetFrameTick = Number.NEGATIVE_INFINITY
        this.alpha = 0
        this.frameA = null
        this.frameB = null
        this.availableFirstTick = null
        this.availableLastTick = null
        this.desiredBufferMs = 0
        this.latestBufferMs = null
        this.bufferErrorMs = null
        this.desiredBufferTicks = 0
        this.latestBufferTicks = null
        this.bufferErrorTicks = null
    }

    private readonly removeUnseen = (generation: number, nid: number) => {
        if (generation !== this.generation) {
            this.values.delete(nid)
            this.seen.delete(nid)
        }
    }

    /** @internal Used by FixedStepInterpolator; omitted from package declarations. */
    update(
        diagnostics: InterpolationDiagnostics,
        context: Context,
        timelines: Map<number, EntityTimeline>,
        nids: Iterable<number>,
        sample: (nid: number, entityA: IEntity, entityB: IEntity | null, target?: IEntity) => IEntity
    ) {
        if (this.sampling) throw new Error('Cannot sample into an InterpolationOutput that is already being sampled.')
        Object.assign(this, diagnostics)
        if (this.context !== context || diagnostics.status !== InterpolationStatus.Ok || !diagnostics.frameA || !diagnostics.frameB) {
            this.values.clear()
            this.seen.clear()
        }
        this.context = context
        if (diagnostics.status !== InterpolationStatus.Ok || !diagnostics.frameA || !diagnostics.frameB) {
            return
        }

        this.generation++
        this.sampling = true
        try {
            sampleEntityTimelines(timelines, diagnostics.frameA.tick, diagnostics.frameB.tick, (nid, entityA, entityB) => {
                const entity = sample(nid, entityA, entityB, this.values.get(nid))
                this.seen.set(nid, this.generation)
                return entity
            }, nids, this.values)
            this.seen.forEach(this.removeUnseen)
        } catch (error) {
            // A throwing iterator/custom binary type may have partially written
            // poses. Expose no stale or partial sample after the failed call.
            this.sampling = false
            this.clear()
            throw error
        } finally {
            this.sampling = false
        }
    }
}
