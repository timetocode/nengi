import {
    NetworkConditionLink,
    NetworkConditionTimerDriver,
    NetworkDelayModel
} from './NetworkConditionLink'

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

    it('copies delayed binary payloads when they are enqueued', () => {
        let nowMs = 0
        const link = new NetworkConditionLink(
            { seed: 2, clientToServer: { latencyMs: 10 } },
            { now: () => nowMs }
        )
        const source = new Uint8Array([1, 2, 3])
        let received: Uint8Array | undefined

        link.sendClientToServer(source, payload => {
            received = payload
        })
        source[0] = 99
        nowMs = 10
        link.advance()

        expect(received).toEqual(new Uint8Array([1, 2, 3]))
        expect(received).not.toBe(source)
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
