import {
    NetworkConditionLink,
    NetworkConditionTimerDriver,
    NetworkDelayModel
} from './NetworkConditionLink'
import { BinaryPayload } from '../binary/BinaryAdapter'

describe('NetworkConditionLink', () => {
    it('reproduces seeded asymmetric jitter independently by direction', () => {
        const first = sampledSchedule(42)
        const second = sampledSchedule(42)
        const different = sampledSchedule(43)

        expect(first).toEqual(second)
        expect(first).not.toEqual(different)
        expect(first.clientToServer.every(value => value >= 80 && value <= 120)).toBe(true)
        expect(first.serverToClient.every(value => value >= 35 && value <= 45)).toBe(true)
    })

    it('preserves FIFO ordering when a later payload samples less delay', () => {
        let nowMs = 0
        const delays = [100, 20]
        const model: NetworkDelayModel = {
            sample: () => ({ delayMs: delays.shift()! })
        }
        const link = new NetworkConditionLink(
            {
                seed: 1,
                clientToServer: { model }
            },
            { now: () => nowMs }
        )
        const delivered: number[] = []

        const firstRelease = link.sendClientToServer(new Uint8Array([1]), payload => {
            delivered.push(payload[0])
        })
        nowMs = 10
        const secondRelease = link.sendClientToServer(new Uint8Array([2]), payload => {
            delivered.push(payload[0])
        })

        expect(firstRelease).toBe(100)
        expect(secondRelease).toBe(100)
        expect(link.status()).toMatchObject({
            clientToServer: {
                sampledDelayMs: 20,
                effectiveDelayMs: 90
            }
        })
        expect(link.advanceTo(99)).toBe(0)
        expect(link.advanceTo(100)).toBe(2)
        expect(delivered).toEqual([1, 2])
    })

    it('turns periodic burst windows into ordered delivery stalls', () => {
        let nowMs = 0
        const link = new NetworkConditionLink(
            {
                seed: 7,
                clientToServer: {
                    burst: {
                        everyMs: 100,
                        durationMs: 30
                    }
                }
            },
            { now: () => nowMs }
        )
        const delivered: number[] = []

        expect(link.sendClientToServer(new Uint8Array([1]), payload => delivered.push(payload[0]))).toBe(30)
        nowMs = 10
        expect(link.sendClientToServer(new Uint8Array([2]), payload => delivered.push(payload[0]))).toBe(30)
        expect(link.status().clientToServer.state).toBe('burst')
        link.advanceTo(30)

        expect(delivered).toEqual([1, 2])
        expect(link.status(30).clientToServer.queued).toBe(0)
    })

    describe.each(['clientToServer', 'serverToClient'] as const)('%s payload ownership', direction => {
        const payloads: [string, () => BinaryPayload][] = [
            ['ArrayBuffer', () => new Uint8Array([18, 52]).buffer],
            ['DataView', () => new DataView(new Uint8Array([0, 18, 52, 255]).buffer, 1, 2)],
            ['Buffer', () => Buffer.from([0, 18, 52, 255]).subarray(1, 3)],
            ['Uint8Array', () => new Uint8Array([0, 18, 52, 255]).subarray(1, 3)],
            ['Uint8ClampedArray', () => new Uint8ClampedArray([0, 18, 52, 255]).subarray(1, 3)],
            ['Int8Array', () => new Int8Array([0, -1, 127, 0]).subarray(1, 3)],
            ['Uint16Array', () => new Uint16Array([0, 0x1234, 0xffff, 0]).subarray(1, 3)],
            ['Int16Array', () => new Int16Array([0, -1234, 32767, 0]).subarray(1, 3)],
            ['Uint32Array', () => new Uint32Array([0, 0x12345678, 0xffffffff, 0]).subarray(1, 3)],
            ['Int32Array', () => new Int32Array([0, -12345678, 0x7fffffff, 0]).subarray(1, 3)],
            ['Float32Array', () => new Float32Array([0, 1.5, -2.75, 0]).subarray(1, 3)],
            ['Float64Array', () => new Float64Array([0, Math.PI, -0, 0]).subarray(1, 3)],
            ['BigInt64Array', () => new BigInt64Array([BigInt(0), BigInt(-123), BigInt('9223372036854775807'), BigInt(0)]).subarray(1, 3)],
            ['BigUint64Array', () => new BigUint64Array([BigInt(0), BigInt(123), BigInt('18446744073709551615'), BigInt(0)]).subarray(1, 3)],
            ['empty view', () => new Uint16Array([1, 2]).subarray(1, 1)],
            ['NaN bit pattern', () => new Float32Array(new Uint32Array([0x7fc01234]).buffer)]
        ]

        it.each(payloads)('owns the exact byte window and type of %s', (_name, createPayload) => {
            let nowMs = 0
            const link = new NetworkConditionLink(
                { seed: 2, [direction]: { latencyMs: 10 } },
                { now: () => nowMs }
            )
            const source = createPayload()
            const expectedBytes = Array.from(payloadBytes(source))
            const received: BinaryPayload[] = []
            const deliver = (payload: BinaryPayload) => received.push(payload)

            if (direction === 'clientToServer') link.sendClientToServer(source, deliver)
            else link.sendServerToClient(source, deliver)
            payloadBytes(source).fill(255)
            expect(received).toHaveLength(0)
            nowMs = 10
            expect(link.advance()).toBe(1)

            const copy = received[0]
            expect(copy).not.toBe(source)
            expect(copy.constructor).toBe(source.constructor)
            expect(copy.byteLength).toBe(source.byteLength)
            expect(Array.from(payloadBytes(copy))).toEqual(expectedBytes)
            if ('length' in source && 'length' in copy) expect(copy.length).toBe(source.length)
        })

        it('leaves pending deliveries and scheduling status intact when a copy fails', () => {
            let nowMs = 0
            const timers = new FakeTimers(() => nowMs)
            const delays = [20, 100, 0]
            const link = new NetworkConditionLink(
                { seed: 2, [direction]: { model: { sample: () => ({ delayMs: delays.shift()! }) } } },
                { now: () => nowMs, timers }
            )
            const received: number[] = []
            const send = (payload: Uint8Array) => direction === 'clientToServer'
                ? link.sendClientToServer(payload, value => received.push(value[0]))
                : link.sendServerToClient(payload, value => received.push(value[0]))

            expect(send(new Uint8Array([1]))).toBe(20)
            const beforeFailure = link.status()
            const detached = new Uint8Array([2])
            structuredClone(detached.buffer, { transfer: [detached.buffer] })
            expect(() => send(detached)).toThrow('detached')
            expect(link.status()).toEqual(beforeFailure)
            expect(timers.pending()).toBe(1)

            expect(send(new Uint8Array([3]))).toBe(20)
            nowMs = 20
            timers.runDue()
            expect(received).toEqual([1, 3])
            expect(link.status()[direction]).toMatchObject({ queued: 0, enqueued: 2, delivered: 2 })
            expect(timers.pending()).toBe(0)
        })
    })

    it('preserves queued release times when conditions are reconfigured', () => {
        let nowMs = 0
        const link = new NetworkConditionLink(
            { seed: 1, clientToServer: { latencyMs: 100 } },
            { now: () => nowMs }
        )
        const delivered: number[] = []

        link.sendClientToServer(new Uint8Array([1]), payload => delivered.push(payload[0]))
        nowMs = 10
        link.configure({ seed: 2, clientToServer: { latencyMs: 5 } })
        const nextRelease = link.sendClientToServer(
            new Uint8Array([2]),
            payload => delivered.push(payload[0])
        )

        expect(nextRelease).toBe(100)
        link.advanceTo(100)
        expect(delivered).toEqual([1, 2])
    })

    it('can drive live delivery through one rescheduled timer', () => {
        let nowMs = 0
        const timers = new FakeTimers(() => nowMs)
        const link = new NetworkConditionLink(
            {
                seed: 5,
                clientToServer: { latencyMs: 100 },
                serverToClient: { latencyMs: 20 }
            },
            { now: () => nowMs, timers }
        )
        const delivered: string[] = []

        link.sendClientToServer(new Uint8Array([1]), () => delivered.push('client'))
        link.sendServerToClient(new Uint8Array([2]), () => delivered.push('server'))

        expect(timers.pending()).toBe(1)
        nowMs = 20
        timers.runDue()
        expect(delivered).toEqual(['server'])
        expect(timers.pending()).toBe(1)
        nowMs = 100
        timers.runDue()
        expect(delivered).toEqual(['server', 'client'])
        expect(timers.pending()).toBe(0)
    })

    it('rejects invalid profiles, model output, and backwards time', () => {
        expect(() => new NetworkConditionLink({
            seed: 1,
            clientToServer: { burst: { everyMs: 10, durationMs: 10 } }
        })).toThrow('burst.durationMs')

        let nowMs = 10
        const link = new NetworkConditionLink(
            {
                seed: 1,
                clientToServer: {
                    model: { sample: () => ({ delayMs: Number.NaN }) }
                }
            },
            { now: () => nowMs }
        )
        expect(() => link.sendClientToServer(new Uint8Array([1]), () => {})).toThrow(
            'finite, non-negative'
        )
        nowMs = 9
        expect(() => link.advance()).toThrow('cannot move backwards')
    })
})

function payloadBytes(payload: BinaryPayload) {
    return payload instanceof ArrayBuffer
        ? new Uint8Array(payload)
        : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
}

function sampledSchedule(seed: number) {
    let nowMs = 0
    const link = new NetworkConditionLink(
        {
            seed,
            clientToServer: { latencyMs: 100, jitterMs: 20 },
            serverToClient: { latencyMs: 40, jitterMs: 5 }
        },
        { now: () => nowMs }
    )
    const clientToServer: number[] = []
    const serverToClient: number[] = []

    for (let i = 0; i < 5; i++) {
        const enqueuedAtMs = nowMs
        clientToServer.push(
            link.sendClientToServer(new Uint8Array([i]), () => {}) - enqueuedAtMs
        )
        serverToClient.push(
            link.sendServerToClient(new Uint8Array([i]), () => {}) - enqueuedAtMs
        )
        nowMs += 200
        link.advance()
    }

    return { clientToServer, serverToClient }
}

class FakeTimers implements NetworkConditionTimerDriver {
    private nextId = 1
    private readonly timers = new Map<number, { callback: () => void, dueAtMs: number }>()

    constructor(private readonly now: () => number) {}

    setTimeout(callback: () => void, delayMs: number) {
        const id = this.nextId++
        this.timers.set(id, { callback, dueAtMs: this.now() + delayMs })
        return id
    }

    clearTimeout(handle: unknown) {
        this.timers.delete(handle as number)
    }

    pending() {
        return this.timers.size
    }

    runDue() {
        const due = Array.from(this.timers.entries())
            .filter(([, timer]) => timer.dueAtMs <= this.now())
            .sort((left, right) => left[1].dueAtMs - right[1].dueAtMs)
        for (const [id, timer] of due) {
            this.timers.delete(id)
            timer.callback()
        }
    }
}
