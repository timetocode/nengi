import { Buffer } from 'buffer'
import { Binary, BinarySection, Client, Context, EngineMessage, Instance, LocalClientAdapter,
    MAX_CLIENT_ENGINE_MESSAGES_PER_PACKET, MAX_CLIENT_PACKET_SECTIONS, User, UserConnectionState,
    defineMessageSchema, getCommandViewTimeMs } from '../index'
import { testBinaryAdapter as binary } from '../testSupport/BufferBinary'
import countMessage from '../binary/message/count'
import { writeMessage } from '../binary/message/writeMessage'

function join(parts: Buffer[]) { return Buffer.from(parts.flatMap(part => Array.from(part))) }

function fixture(open = true) {
    let now = 100
    const context = new Context()
    context.register(1, defineMessageSchema({ value: Binary.UInt8 }))
    const instance = new Instance(context, { now: () => now })
    instance.onConnect = jest.fn(async () => true)
    const errors = jest.fn()
    instance.onInboundMessageError = errors
    const adapter = { binary, send: jest.fn(), disconnect: jest.fn(), terminate: jest.fn(), listen: jest.fn() }
    const user = new User(null, adapter)
    instance.network.onOpen(user)
    if (open) { user.instance = instance; instance.network.onConnectionAccepted(user, {}) }
    instance.queue.clear()
    const client = new Client(context, LocalClientAdapter, 20, { binary })
    const packet = (...messages: any[]) => {
        const bytes = messages.reduce((sum, msg) => sum + countMessage(context.getEngineSchema(msg.ntype), msg), 0)
            + 2 * Math.ceil(messages.length / 255)
        const writer = binary.createWriter(bytes)
        for (let offset = 0; offset < messages.length; offset += 255) {
            writer.writeUInt8(BinarySection.EngineMessages)
            writer.writeUInt8(Math.min(255, messages.length - offset))
            for (const msg of messages.slice(offset, offset + 255)) writeMessage(msg, context.getEngineSchema(msg.ntype), writer)
        }
        return writer.payload
    }
    return { instance, user, client, packet, errors, adapter, setTime: (value: number) => { now = value } }
}
const frame = (value = 1) => ({ ntype: EngineMessage.CommandFrameNumber, commandFrameNumber: value })
const delay = (value = 50) => ({ ntype: EngineMessage.InterpolationDelay, delayMs: value })
const pong = (values = {}) => ({ ntype: EngineMessage.Pong, pingId: 1, clientReceiveTimeMs: 40, clientSendTimeMs: 45, ...values })
const timing = (values = {}) => ({ ntype: EngineMessage.CommandTiming, commandIndex: 0,
    clientTimeMs: 50, renderDelayMs: 10, viewTick: -1, viewServerTimeMs: -1, ...values })
const command = Buffer.from([BinarySection.Commands, 1, 1, 7])

describe('client engine control validation', () => {
    it.each([EngineMessage.ConnectionAccepted, EngineMessage.ConnectionDenied, EngineMessage.ConnectionTerminated,
        EngineMessage.Ping, EngineMessage.Protocol, EngineMessage.ChannelJoin, 255])('rejects server-only/unknown type %i before reading its body', ntype => {
        const { instance, user, errors } = fixture()
        const schema = jest.spyOn(instance.context, 'getEngineSchema')
        instance.network.onMessage(user, Buffer.from([BinarySection.EngineMessages, 1, ntype]))
        expect(schema).not.toHaveBeenCalled()
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(errors.mock.calls[0][0].error.message).toMatch(/not permitted/)
    })

    const forbiddenSections = Object.values(BinarySection).filter(value => typeof value === 'number' &&
        ![BinarySection.EngineMessages, BinarySection.Commands, BinarySection.Requests].includes(value)) as number[]
    it.each(forbiddenSections)('rejects outer section %i', section => {
        const { instance, user, errors } = fixture()
        instance.network.onMessage(user, Buffer.from([section, 0]))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(errors.mock.calls[0][0].error.message).toMatch(/Unknown binary section/)
    })

    it.each([frame(), delay(), pong(), timing()])('requires acceptance for control $ntype', msg => {
        for (const awaiting of [false, true]) {
            const { instance, user, packet } = fixture(false)
            if (awaiting) user.connectionState = UserConnectionState.OpenAwaitingHandshake
            instance.network.onMessage(user, packet(msg))
            expect(user.connectionState).toBe(UserConnectionState.Closed)
            expect(user.lastReceivedCommandFrameNumber).toBe(0)
            expect(user.interpolationDelayMs).toBe(0)
            expect(instance.onConnect).not.toHaveBeenCalled()
        }
    })

    it('rejects gameplay controls beside the initial handshake without starting authentication', () => {
        const { instance, user, client, packet } = fixture(false)
        instance.network.onMessage(user, join([client.network.createHandshake({}, binary), packet(frame())]))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.onConnect).not.toHaveBeenCalled()
    })

    it('does not let a malformed suffix apply a valid control prefix', () => {
        const { instance, user, packet } = fixture()
        user.recordPingSent(1, 80, 80)
        instance.network.onMessage(user, join([packet(pong(), frame(), delay()), Buffer.from([255])]))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(user.lastReceivedCommandFrameNumber).toBe(0)
        expect(user.interpolationDelayMs).toBe(0)
        expect(user.clockSyncSamples).toBe(0)
        expect(user.lastPongReceivedAtMs).toBe(null)
        expect(user.pendingPings.has(1)).toBe(true)
    })

    it.each([{messages: [frame(), frame(2)]}, {messages: [delay(), delay(60)]}, {messages: [timing(), timing()]}])('rejects duplicate controls across sections', ({ messages }) => {
        const { instance, user, packet } = fixture()
        instance.network.onMessage(user, join([...messages.map(msg => packet(msg)), command]))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(user.lastReceivedCommandFrameNumber).toBe(0)
    })

    it.each([0, 4, 5])('rejects non-advancing frame %i without changing the previous counter', value => {
        const { instance, user, packet } = fixture()
        user.receiveCommandFrameNumber(5)
        instance.network.onMessage(user, packet(frame(value)))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(user.lastReceivedCommandFrameNumber).toBe(5)
    })

    it('allows gaps in advancing frame numbers without interpreting them as game progress', () => {
        const { instance, user, packet } = fixture()
        instance.network.onMessage(user, packet(frame(5)))
        instance.network.onMessage(user, packet(frame(8)))
        expect(user.lastReceivedCommandFrameNumber).toBe(8)
        expect(user.connectionState).toBe(UserConnectionState.Open)
        expect(instance.queue.length).toBe(0)
    })

    it('rejects timing that references no command', () => {
        const { instance, user, packet } = fixture()
        instance.network.onMessage(user, packet(timing()))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.queue.arr.every(event => !event.commands)).toBe(true)
    })

    it.each([timing({clientTimeMs: NaN}), timing({clientTimeMs: 1e308}), timing({renderDelayMs: Infinity}),
        timing({renderDelayMs: -1}), timing({viewTick: NaN}), timing({viewServerTimeMs: Infinity}),
        delay(NaN), delay(-1), pong({clientReceiveTimeMs: NaN}), pong({clientSendTimeMs: 20})])('contains invalid metadata $ntype', msg => {
        const { instance, user, packet } = fixture()
        instance.network.onMessage(user, join([packet(frame(), msg), command]))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(user.lastReceivedCommandFrameNumber).toBe(0)
        expect(instance.queue.arr.every(event => !event.commands)).toBe(true)
    })

    it('ignores impossible finite Pong samples without consuming a ping or refreshing liveness', () => {
        const { instance, user, packet } = fixture()
        user.recordPingSent(1, 80, 80)
        for (const msg of [pong({clientReceiveTimeMs: 1e308, clientSendTimeMs: 1e308}),
            pong({clientReceiveTimeMs: 0, clientSendTimeMs: 1000})]) {
            instance.network.onMessage(user, packet(msg))
            expect(user.clockOffsetMs).toBe(0)
            expect(user.clockSyncSamples).toBe(0)
            expect(user.lastPongReceivedAtMs).toBe(null)
            expect(user.pendingPings.has(1)).toBe(true)
        }
        instance.network.onMessage(user, packet(pong()))
        expect(user.clockSyncSamples).toBe(1)
        expect(user.lastPongReceivedAtMs).toBe(100)
    })

    it('accepts delayed Pongs once, ignores unknown/replayed Pongs, and uses the valid sample for command timing', () => {
        const { instance, user, packet, setTime } = fixture()
        user.recordPingSent(1, 80, 80)
        user.recordPingSent(2, 90, 90)
        instance.network.onMessage(user, join([packet(pong({pingId: 50}), pong(), pong(), timing()), command]))
        expect(user.clockSyncSamples).toBe(1)
        expect(user.pendingPings.has(2)).toBe(true)
        const received = instance.queue.next().commandTimings![0]!
        expect(received.clockSyncSamples).toBe(1)
        expect(Object.values(received).every(Number.isFinite)).toBe(true)
        expect(getCommandViewTimeMs({...received, viewServerTimeMs: 0}, { nowMs: 1000, maxRewindMs: 250 })).toBe(750)
        setTime(200)
        instance.network.onMessage(user, packet(pong()))
        expect(user.lastPongReceivedAtMs).toBe(100)
    })

    it('caps engine records across repeated sections, including unmatched Pongs', () => {
        const { instance, user, packet, errors } = fixture()
        instance.network.onMessage(user, packet(...Array.from({length: MAX_CLIENT_ENGINE_MESSAGES_PER_PACKET}, () => pong())))
        expect(user.connectionState).toBe(UserConnectionState.Open)
        instance.network.onMessage(user, packet(...Array.from({length: MAX_CLIENT_ENGINE_MESSAGES_PER_PACKET + 1}, () => pong())))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(errors.mock.calls[0][0].error.message).toMatch(/Too many client engine messages/)
    })

    it('caps repeated empty sections as well as records', () => {
        const { instance, user } = fixture()
        const section = Buffer.from([BinarySection.Commands, 0])
        instance.network.onMessage(user, join(Array(MAX_CLIENT_PACKET_SECTIONS).fill(section)))
        expect(user.connectionState).toBe(UserConnectionState.Open)
        instance.network.onMessage(user, join(Array(MAX_CLIENT_PACKET_SECTIONS + 1).fill(section)))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
    })

    it('encodes a full 255-command timing batch plus frame/delay/Pongs across valid sections', () => {
        const { instance, user, client } = fixture()
        for (let i = 0; i < 255; i++) client.addCommandWithTiming({ntype: 1, value: i}, {inputTimeMs: 50})
        client.reportInterpolationDelay(30, {force:true})
        client.reportInterpolationDelay(60, {force:true})
        ;(client.network as any).pendingPongs = Array.from({length: 255}, (_, i) => ({pingId:i + 1,clientReceiveTimeMs:0}))
        instance.network.onMessage(user, client.network.createOutbound(binary))
        expect(user.connectionState).toBe(UserConnectionState.Open)
        expect(user.interpolationDelayMs).toBe(60)
        const event = instance.queue.next()
        expect(event.commands).toHaveLength(255)
        expect(event.commandTimings).toHaveLength(255)
        expect(event.commands[254].value).toBe(254)
        expect(event.commandFrameNumber).toBe(1)
    })

    it('shares native control credits with data and never treats native Pong as clock proof', () => {
        const instance = new Instance(new Context(), { now: () => 100, limits: { packetBurst: 2, packetsPerSecond: 1 } })
        const adapter = { binary, send: jest.fn(), disconnect: jest.fn(), terminate: jest.fn(), listen: jest.fn() }
        const user = new User(null, adapter)
        instance.network.onOpen(user)
        expect(instance.network.onTransportControl(user, 0)).toBe(true)
        instance.network.onMessage(user, Buffer.alloc(0))
        expect(instance.network.onTransportControl(user, 0)).toBe(false)
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(user.clockSyncSamples).toBe(0)
        expect(user.lastPongReceivedAtMs).toBe(null)
        expect(adapter.terminate).toHaveBeenCalledTimes(1)
        expect(instance.network.onTransportControl(user, 0)).toBe(false)
        expect(adapter.terminate).toHaveBeenCalledTimes(1)
    })

    it('preserves another accepted user after rejecting a forged engine control', () => {
        const { instance, user, adapter } = fixture()
        const healthy = new User(null, adapter)
        instance.network.onOpen(healthy)
        healthy.instance = instance
        instance.network.onConnectionAccepted(healthy, {})
        instance.queue.clear()
        instance.network.onMessage(user, Buffer.from([BinarySection.EngineMessages, 1, EngineMessage.Protocol]))
        instance.network.onMessage(healthy, command)
        expect(instance.queue.arr.find(event => event.commands)?.commands[0].value).toBe(7)
        instance.queue.clear()
        instance.step()
        expect(healthy.lastSentInstanceTick).toBe(instance.tick)
        expect(instance.users.size).toBe(1)
    })

    it('rejects oversized local command batches instead of truncating their wire count', () => {
        const { client } = fixture()
        for (let i = 0; i < 256; i++) client.addCommand({ntype:1,value:7})
        expect(() => client.network.createOutbound(binary)).toThrow(/at most 255 commands/)
    })
})
