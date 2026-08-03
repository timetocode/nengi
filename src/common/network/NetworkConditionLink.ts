import { BinaryPayload } from '../binary/BinaryAdapter'
import { getMonotonicTime, TimeSource } from '../time'

export type NetworkDirection = 'clientToServer' | 'serverToClient'

export type NetworkBurstConditions = {
    everyMs: number
    durationMs: number
    offsetMs?: number
}

export type NetworkDirectionConditions = {
    latencyMs?: number
    jitterMs?: number
    burst?: NetworkBurstConditions
}

export type NetworkDelayContext = {
    direction: NetworkDirection
    sequence: number
    enqueuedAtMs: number
    elapsedMs: number
    byteLength: number
    random: () => number
}

export type NetworkDelayDecision = {
    delayMs: number
    state?: string
}

export interface NetworkDelayModel {
    sample(context: NetworkDelayContext): NetworkDelayDecision
    reset?(seed: number, startedAtMs: number, direction: NetworkDirection): void
}

export type NetworkDirectionProfile = NetworkDirectionConditions | {
    model: NetworkDelayModel
}

export type NetworkConditions = {
    seed: number
    clientToServer?: NetworkDirectionProfile
    serverToClient?: NetworkDirectionProfile
}

export type NetworkConditionTimerDriver = {
    setTimeout(callback: () => void, delayMs: number): unknown
    clearTimeout(handle: unknown): void
}

export type NetworkConditionLinkOptions = {
    now?: TimeSource
    timers?: NetworkConditionTimerDriver
}

export type NetworkDirectionStatus = {
    queued: number
    sampledDelayMs: number
    effectiveDelayMs: number
    state: string
    nextReleaseAtMs: number | null
    nextReleaseInMs: number
    enqueued: number
    delivered: number
}

export type NetworkConditionStatus = {
    seed: number
    clientToServer: NetworkDirectionStatus
    serverToClient: NetworkDirectionStatus
}

type DirectionState = {
    profile: NetworkDirectionProfile
    random: () => number
    startedAtMs: number
    lastReleaseAtMs: number
    sampledDelayMs: number
    effectiveDelayMs: number
    state: string
    enqueued: number
    delivered: number
}

type QueuedDelivery = {
    direction: NetworkDirection
    sequence: number
    releaseAtMs: number
    payload: BinaryPayload
    deliver: (payload: any) => void
}

const CLIENT_TO_SERVER_SEED = 0x43f2a96d
const SERVER_TO_CLIENT_SEED = 0x9e3779b9

export class NetworkConditionLink {
    private conditions: NetworkConditions
    private readonly now: TimeSource
    private readonly timers?: NetworkConditionTimerDriver
    private readonly directions: Record<NetworkDirection, DirectionState>
    private readonly deliveries: QueuedDelivery[] = []
    private sequence = 0
    private lastObservedAtMs = Number.NEGATIVE_INFINITY
    private timer: unknown = null
    private timerDueAtMs = Number.POSITIVE_INFINITY
    private advancing = false

    constructor(conditions: NetworkConditions, options: NetworkConditionLinkOptions = {}) {
        this.now = options.now ?? getMonotonicTime
        this.timers = options.timers
        const startedAtMs = this.readNow()
        this.conditions = normalizeNetworkConditions(conditions)
        this.directions = {
            clientToServer: this.createDirectionState(
                'clientToServer',
                this.conditions.clientToServer ?? {},
                startedAtMs
            ),
            serverToClient: this.createDirectionState(
                'serverToClient',
                this.conditions.serverToClient ?? {},
                startedAtMs
            )
        }
    }

    sendClientToServer<T extends BinaryPayload>(payload: T, deliver: (payload: T) => void) {
        return this.enqueue('clientToServer', payload, deliver)
    }

    sendServerToClient<T extends BinaryPayload>(payload: T, deliver: (payload: T) => void) {
        return this.enqueue('serverToClient', payload, deliver)
    }

    advance() {
        return this.advanceTo(this.readNow())
    }

    advanceTo(nowMs: number) {
        this.observeTime(nowMs)
        this.cancelTimer()
        this.advancing = true
        let delivered = 0

        try {
            while (this.deliveries.length > 0 && this.deliveries[0].releaseAtMs <= nowMs) {
                const delivery = this.deliveries.shift()!
                delivery.deliver(delivery.payload)
                this.directions[delivery.direction].delivered++
                delivered++
            }
        } finally {
            this.advancing = false
            this.scheduleTimer()
        }

        return delivered
    }

    configure(conditions: NetworkConditions) {
        const nowMs = this.readNow()
        this.conditions = normalizeNetworkConditions(conditions)
        this.configureDirection('clientToServer', this.conditions.clientToServer ?? {}, nowMs)
        this.configureDirection('serverToClient', this.conditions.serverToClient ?? {}, nowMs)
    }

    clear() {
        this.cancelTimer()
        this.deliveries.length = 0
        this.directions.clientToServer.lastReleaseAtMs = Number.NEGATIVE_INFINITY
        this.directions.serverToClient.lastReleaseAtMs = Number.NEGATIVE_INFINITY
    }

    status(nowMs = this.readNow()): NetworkConditionStatus {
        this.observeTime(nowMs)
        return {
            seed: this.conditions.seed,
            clientToServer: this.directionStatus('clientToServer', nowMs),
            serverToClient: this.directionStatus('serverToClient', nowMs)
        }
    }

    private enqueue<T extends BinaryPayload>(
        direction: NetworkDirection,
        payload: T,
        deliver: (payload: T) => void
    ) {
        const nowMs = this.readNow()
        const directionState = this.directions[direction]
        const sequence = this.sequence++
        const decision = sampleDelay(
            directionState.profile,
            directionState.random,
            {
                direction,
                sequence,
                enqueuedAtMs: nowMs,
                elapsedMs: nowMs - directionState.startedAtMs,
                byteLength: payload.byteLength,
                random: directionState.random
            },
            directionState.startedAtMs
        )
        validateDelayDecision(decision)

        const releaseAtMs = Math.max(
            nowMs + decision.delayMs,
            directionState.lastReleaseAtMs
        )
        directionState.lastReleaseAtMs = releaseAtMs
        directionState.sampledDelayMs = decision.delayMs
        directionState.effectiveDelayMs = releaseAtMs - nowMs
        directionState.state = decision.state ?? 'normal'
        directionState.enqueued++

        const queued: QueuedDelivery = {
            direction,
            sequence,
            releaseAtMs,
            payload: cloneBinaryPayload(payload),
            deliver
        }
        insertDelivery(this.deliveries, queued)
        this.scheduleTimer()
        return releaseAtMs
    }

    private createDirectionState(
        direction: NetworkDirection,
        profile: NetworkDirectionProfile,
        startedAtMs: number
    ): DirectionState {
        const seed = directionSeed(this.conditions.seed, direction)
        resetProfile(profile, seed, startedAtMs, direction)
        return {
            profile,
            random: createSeededRandom(seed),
            startedAtMs,
            lastReleaseAtMs: Number.NEGATIVE_INFINITY,
            sampledDelayMs: 0,
            effectiveDelayMs: 0,
            state: 'normal',
            enqueued: 0,
            delivered: 0
        }
    }

    private configureDirection(
        direction: NetworkDirection,
        profile: NetworkDirectionProfile,
        nowMs: number
    ) {
        const state = this.directions[direction]
        const seed = directionSeed(this.conditions.seed, direction)
        state.profile = profile
        state.random = createSeededRandom(seed)
        state.startedAtMs = nowMs
        state.sampledDelayMs = 0
        state.effectiveDelayMs = 0
        state.state = 'normal'
        resetProfile(profile, seed, nowMs, direction)
    }

    private directionStatus(direction: NetworkDirection, nowMs: number): NetworkDirectionStatus {
        const state = this.directions[direction]
        const next = this.deliveries.find(delivery => delivery.direction === direction)
        return {
            queued: this.deliveries.reduce(
                (count, delivery) => count + Number(delivery.direction === direction),
                0
            ),
            sampledDelayMs: state.sampledDelayMs,
            effectiveDelayMs: state.effectiveDelayMs,
            state: state.state,
            nextReleaseAtMs: next?.releaseAtMs ?? null,
            nextReleaseInMs: Math.max(0, (next?.releaseAtMs ?? nowMs) - nowMs),
            enqueued: state.enqueued,
            delivered: state.delivered
        }
    }

    private scheduleTimer() {
        if (!this.timers || this.advancing || this.deliveries.length === 0) {
            return
        }

        const nextReleaseAtMs = this.deliveries[0].releaseAtMs
        if (this.timer !== null && this.timerDueAtMs <= nextReleaseAtMs) {
            return
        }
        this.cancelTimer()
        const delayMs = Math.max(0, nextReleaseAtMs - this.readNow())
        this.timerDueAtMs = nextReleaseAtMs
        this.timer = this.timers.setTimeout(() => {
            this.timer = null
            this.timerDueAtMs = Number.POSITIVE_INFINITY
            this.advance()
        }, delayMs)
    }

    private cancelTimer() {
        if (this.timer !== null && this.timers) {
            this.timers.clearTimeout(this.timer)
        }
        this.timer = null
        this.timerDueAtMs = Number.POSITIVE_INFINITY
    }

    private readNow() {
        const nowMs = this.now()
        this.observeTime(nowMs)
        return nowMs
    }

    private observeTime(nowMs: number) {
        if (!Number.isFinite(nowMs)) {
            throw new Error('Network condition time must be finite.')
        }
        if (nowMs < this.lastObservedAtMs) {
            throw new Error(
                `Network condition time cannot move backwards from ${this.lastObservedAtMs} to ${nowMs}.`
            )
        }
        this.lastObservedAtMs = nowMs
    }
}

function normalizeNetworkConditions(conditions: NetworkConditions): NetworkConditions {
    if (!conditions || !Number.isFinite(conditions.seed)) {
        throw new Error('Network conditions require a finite seed.')
    }
    return {
        seed: Math.trunc(conditions.seed) >>> 0,
        clientToServer: normalizeProfile(conditions.clientToServer ?? {}),
        serverToClient: normalizeProfile(conditions.serverToClient ?? {})
    }
}

function normalizeProfile(profile: NetworkDirectionProfile): NetworkDirectionProfile {
    if ('model' in profile) {
        if (!profile.model || typeof profile.model.sample !== 'function') {
            throw new Error('Custom network delay models must define sample().')
        }
        return profile
    }

    const latencyMs = finiteNonNegative('latencyMs', profile.latencyMs ?? 0)
    const jitterMs = finiteNonNegative('jitterMs', profile.jitterMs ?? 0)
    let burst: NetworkBurstConditions | undefined
    if (profile.burst) {
        const everyMs = finitePositive('burst.everyMs', profile.burst.everyMs)
        const durationMs = finiteNonNegative('burst.durationMs', profile.burst.durationMs)
        const offsetMs = finiteNonNegative('burst.offsetMs', profile.burst.offsetMs ?? 0)
        if (durationMs >= everyMs) {
            throw new Error('burst.durationMs must be less than burst.everyMs.')
        }
        burst = { everyMs, durationMs, offsetMs }
    }
    return { latencyMs, jitterMs, ...(burst ? { burst } : {}) }
}

function sampleDelay(
    profile: NetworkDirectionProfile,
    random: () => number,
    context: NetworkDelayContext,
    startedAtMs: number
): NetworkDelayDecision {
    if ('model' in profile) {
        return profile.model.sample(context)
    }

    const jitter = (profile.jitterMs ?? 0) > 0
        ? (random() * 2 - 1) * (profile.jitterMs ?? 0)
        : 0
    let releaseAtMs = context.enqueuedAtMs + Math.max(0, (profile.latencyMs ?? 0) + jitter)
    let state = 'normal'

    if (profile.burst && profile.burst.durationMs > 0) {
        const elapsedAtRelease = releaseAtMs - startedAtMs - (profile.burst.offsetMs ?? 0)
        if (elapsedAtRelease >= 0) {
            const phase = positiveModulo(elapsedAtRelease, profile.burst.everyMs)
            if (phase < profile.burst.durationMs) {
                releaseAtMs += profile.burst.durationMs - phase
                state = 'burst'
            }
        }
    }

    return {
        delayMs: releaseAtMs - context.enqueuedAtMs,
        state
    }
}

function validateDelayDecision(decision: NetworkDelayDecision) {
    if (!decision || !Number.isFinite(decision.delayMs) || decision.delayMs < 0) {
        throw new Error('Network delay models must return a finite, non-negative delayMs.')
    }
    if (decision.state !== undefined && typeof decision.state !== 'string') {
        throw new Error('Network delay model state must be a string when provided.')
    }
}

function resetProfile(
    profile: NetworkDirectionProfile,
    seed: number,
    startedAtMs: number,
    direction: NetworkDirection
) {
    if ('model' in profile) {
        profile.model.reset?.(seed, startedAtMs, direction)
    }
}

function directionSeed(seed: number, direction: NetworkDirection) {
    return (seed ^ (direction === 'clientToServer' ? CLIENT_TO_SERVER_SEED : SERVER_TO_CLIENT_SEED)) >>> 0
}

function createSeededRandom(seed: number) {
    let state = seed || 0x6d2b79f5
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ value >>> 15, value | 1)
        value ^= value + Math.imul(value ^ value >>> 7, value | 61)
        return ((value ^ value >>> 14) >>> 0) / 4294967296
    }
}

function insertDelivery(deliveries: QueuedDelivery[], delivery: QueuedDelivery) {
    let low = 0
    let high = deliveries.length
    while (low < high) {
        const middle = (low + high) >>> 1
        const candidate = deliveries[middle]
        if (
            candidate.releaseAtMs < delivery.releaseAtMs ||
            (candidate.releaseAtMs === delivery.releaseAtMs && candidate.sequence < delivery.sequence)
        ) {
            low = middle + 1
        } else {
            high = middle
        }
    }
    deliveries.splice(low, 0, delivery)
}

function cloneBinaryPayload<T extends BinaryPayload>(payload: T): T {
    if (payload instanceof ArrayBuffer) {
        return payload.slice(0) as T
    }

    const bytes = Uint8Array.from(
        new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
    )
    if (payload instanceof DataView) {
        return new DataView(bytes.buffer) as unknown as T
    }

    const constructor = payload.constructor as {
        new (buffer: ArrayBuffer, byteOffset?: number, length?: number): T
        from?: (value: Uint8Array) => T
    }
    if (typeof constructor.from === 'function') {
        return constructor.from(bytes)
    }
    const length = 'length' in payload ? Number(payload.length) : undefined
    return new constructor(bytes.buffer, 0, length)
}

function finiteNonNegative(name: string, value: number) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be finite and non-negative.`)
    }
    return value
}

function finitePositive(name: string, value: number) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be finite and greater than zero.`)
    }
    return value
}

function positiveModulo(value: number, divisor: number) {
    return ((value % divisor) + divisor) % divisor
}
