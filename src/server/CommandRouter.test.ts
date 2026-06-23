import { NetworkEvent } from '../common/binary/NetworkEvent'
import { CommandRouter } from './CommandRouter'

describe('CommandRouter', () => {
    it('dispatches command sets by ntype in order', () => {
        const router = new CommandRouter()
        const events: string[] = []
        const user = { id: 7 } as any

        router.on<{ ntype: number, value: string }>(1, ({ user, command, commandFrameNumber, commandIndex }) => {
            events.push(`${user.id}:${commandFrameNumber}:${commandIndex}:${command.value}`)
        })
        router.on<{ ntype: number, value: string }>(2, ({ command }) => {
            events.push(`two:${command.value}`)
        })

        const count = router.process({
            type: NetworkEvent.CommandSet,
            user,
            commandFrameNumber: 456,
            commands: [
                { ntype: 1, value: 'a' },
                { ntype: 2, value: 'b' },
                { ntype: 1, value: 'c' }
            ]
        })

        expect(count).toBe(3)
        expect(events).toEqual([
            '7:456:0:a',
            'two:b',
            '7:456:2:c'
        ])
    })

    it('can report unhandled commands', () => {
        const router = new CommandRouter()
        const unhandled: number[] = []

        router.onUnhandled(({ command }) => {
            unhandled.push(command.ntype)
        })

        router.process({
            type: NetworkEvent.CommandSet,
            user: { id: 1 } as any,
            commandFrameNumber: 1,
            commands: [
                { ntype: 9 }
            ]
        })

        expect(unhandled).toEqual([9])
    })

    it('passes per-command timing metadata to handlers', () => {
        const router = new CommandRouter()
        const received: number[] = []
        const timing = {
            commandIndex: 1,
            clientTimeMs: 10,
            renderDelayMs: 100,
            viewTick: 2.5,
            viewServerTimeMs: 1000.5,
            serverReceivedTimeMs: 20,
            estimatedInputTimeMs: 15,
            estimatedViewTimeMs: -85,
            estimatedInputAgeMs: 5,
            estimatedViewAgeMs: 105,
            roundTripMs: 8,
            oneWayMs: 4,
            clockOffsetMs: 5,
            clockSyncSamples: 2
        }

        router.on<{ ntype: number }>(1, ({ timing }) => {
            received.push(timing?.estimatedInputTimeMs ?? -1)
        })

        router.process({
            type: NetworkEvent.CommandSet,
            user: { id: 1 } as any,
            commandFrameNumber: 1,
            commands: [
                { ntype: 1 },
                { ntype: 1 }
            ],
            commandTimings: [
                undefined,
                timing
            ]
        })

        expect(received).toEqual([-1, 15])
    })
})
