import { Binary } from '../common/binary/Binary'
import { defineMessageSchema } from '../common/binary/schema/defineSchema'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { Context } from '../common/Context'
import { Instance } from '../server/Instance'
import { User, UserConnectionState } from '../server/User'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { ClientNetwork } from './ClientNetwork'
import { Predictor } from './prediction/Predictor'

function createUser(instance: Instance) {
    const user = new User(undefined, {
        binary: testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    } as any)
    user.id = 1
    user.instance = instance
    user.connectionState = UserConnectionState.Open
    return user
}

function createClientNetwork(context: Context) {
    const client = {
        context,
        serverTickRate: 20,
        disconnectHandler: jest.fn(),
        websocketErrorHandler: jest.fn(),
        predictor: new Predictor(),
        network: undefined as unknown as ClientNetwork
    }
    const network = new ClientNetwork(client as any)
    client.network = network
    return network
}

describe('client command timing', () => {
    it('sends optional command timing metadata beside commands', () => {
        const context = new Context()
        context.register(1, defineMessageSchema({
            value: Binary.UInt8
        }))
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)

        clientNetwork.addCommandWithTiming({ ntype: 1, value: 7 }, {
            inputTimeMs: 123,
            renderDelayMs: 50,
            viewTick: 4.5,
            viewServerTimeMs: 1000.25
        })

        instance.network.onMessage(user, clientNetwork.createOutbound(testBinaryAdapter))
        const event = instance.queue.next()

        expect(event.type).toBe(NetworkEvent.CommandSet)
        expect(event.commands).toEqual([{ ntype: 1, value: 7 }])
        expect(event.commandTimings?.[0]?.commandIndex).toBe(0)
        expect(event.commandTimings?.[0]?.clientTimeMs).toBe(123)
        expect(event.commandTimings?.[0]?.renderDelayMs).toBe(50)
        expect(event.commandTimings?.[0]?.viewTick).toBe(4.5)
        expect(event.commandTimings?.[0]?.viewServerTimeMs).toBe(1000.25)
        expect(typeof event.commandTimings?.[0]?.estimatedInputTimeMs).toBe('number')
    })

    it('reports interpolation delay with throttling', () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)

        expect(clientNetwork.reportInterpolationDelay(100.4, { now: 1000 })).toBe(true)
        expect(clientNetwork.reportInterpolationDelay(100.6, { now: 1100 })).toBe(false)
        expect(clientNetwork.reportInterpolationDelay(125.2, { now: 1200 })).toBe(false)
        expect(clientNetwork.reportInterpolationDelay(125.2, { now: 1500 })).toBe(true)

        instance.network.onMessage(user, clientNetwork.createOutbound(testBinaryAdapter))

        expect(user.interpolationDelayMs).toBe(125)
        expect(user.lastInterpolationDelayTimeMs).toBeGreaterThanOrEqual(0)
    })
})
