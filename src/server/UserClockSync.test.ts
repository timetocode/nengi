import { User, getCommandViewTimeMs } from './User'

describe('User clock sync timing', () => {
    it('estimates RTT, clock offset, input time, and view time', () => {
        const user = new User({} as any, {} as any)

        user.recordClockSyncPong({
            serverTimeMs: 1000,
            clientReceiveTimeMs: 50,
            clientSendTimeMs: 60
        }, 1030)

        expect(user.roundTripMs).toBe(20)
        expect(user.oneWayMs).toBe(10)
        expect(user.clockOffsetMs).toBe(960)

        const timing = user.estimateCommandTiming({
            commandIndex: 2,
            clientTimeMs: 70,
            renderDelayMs: 100,
            viewTick: 12.5,
            viewServerTimeMs: 2000.5
        }, 1040)

        expect(timing.estimatedInputTimeMs).toBe(1030)
        expect(timing.estimatedViewTimeMs).toBe(930)
        expect(timing.estimatedInputAgeMs).toBe(10)
        expect(timing.estimatedViewAgeMs).toBe(110)
        expect(timing.viewTick).toBe(12.5)
        expect(timing.viewServerTimeMs).toBe(2000.5)
        expect(timing.roundTripMs).toBe(20)
        expect(timing.clockSyncSamples).toBe(1)
    })

    it('falls back to receive time minus one-way delay before clock sync exists', () => {
        const user = new User({} as any, {} as any)
        user.oneWayMs = 25

        const timing = user.estimateCommandTiming({
            commandIndex: 0,
            clientTimeMs: 999,
            renderDelayMs: 50,
            viewTick: -1,
            viewServerTimeMs: -1
        }, 500)

        expect(timing.estimatedInputTimeMs).toBe(475)
        expect(timing.estimatedViewTimeMs).toBe(425)
        expect(timing.estimatedInputAgeMs).toBe(25)
        expect(timing.estimatedViewAgeMs).toBe(75)
        expect(timing.clockSyncSamples).toBe(0)
    })

    it('resolves command view time from explicit viewed server time or relative view age', () => {
        const baseTiming = {
            commandIndex: 0,
            clientTimeMs: 0,
            renderDelayMs: 50,
            viewTick: -1,
            viewServerTimeMs: -1,
            serverReceivedTimeMs: 1000,
            estimatedInputTimeMs: 975,
            estimatedViewTimeMs: 925,
            estimatedInputAgeMs: 25,
            estimatedViewAgeMs: 75,
            roundTripMs: 50,
            oneWayMs: 25,
            clockOffsetMs: 0,
            clockSyncSamples: 0
        }

        expect(getCommandViewTimeMs(undefined, { nowMs: 5000, fallbackRewindMs: 100 })).toBe(4900)
        expect(getCommandViewTimeMs(baseTiming, { nowMs: 5000, fallbackRewindMs: 100 })).toBe(4925)
        expect(getCommandViewTimeMs({ ...baseTiming, viewServerTimeMs: 4700 }, { nowMs: 5000, fallbackRewindMs: 100 })).toBe(4700)
        expect(getCommandViewTimeMs(baseTiming, { nowMs: 5000, maxRewindMs: 40 })).toBe(4960)
    })

    it('rejects stale pong ids', () => {
        const user = new User({} as any, {} as any)
        user.nextPing()
        user.nextPing()

        const accepted = user.recordClockSyncPong({
            pingId: 1,
            serverTimeMs: 1000,
            clientReceiveTimeMs: 50,
            clientSendTimeMs: 60
        }, 1030)

        expect(accepted).toBe(false)
        expect(user.clockSyncSamples).toBe(0)
    })
})
