import {
    AABB3D, Binary, Channel, Channel2D, Channel3D, Client, Context,
    EcsChannel, EcsChannel2D, EcsChannel3D, Instance, LocalClientAdapter,
    LocalInstanceAdapter, ManualChannel, ManualChannel2D, ManualChannel3D,
    defineMessageSchema
} from '../index'
import { testBinaryAdapter } from '../testSupport/BufferBinary'

const channels = [
    ['Channel', (instance: Instance) => new Channel(instance.localState)],
    ['ManualChannel', (instance: Instance) => new ManualChannel(instance.localState)],
    ['EcsChannel', (instance: Instance) => new EcsChannel(instance.localState)],
    ['Channel2D', (instance: Instance) => new Channel2D(instance.localState, 50)],
    ['Channel3D', (instance: Instance) => new Channel3D(instance.localState, 50)],
    ['ManualChannel2D', (instance: Instance) => new ManualChannel2D(instance.localState, 50)],
    ['ManualChannel3D', (instance: Instance) => new ManualChannel3D(instance.localState, 50)],
    ['EcsChannel2D', (instance: Instance) => new EcsChannel2D(instance.localState, 50)],
    ['EcsChannel3D', (instance: Instance) => new EcsChannel3D(instance.localState, 50)]
] as const

describe('scoped message subscription lifetime', () => {
    const clients: Client[] = []
    afterEach(() => {
        for (const client of clients) client.disconnect()
        clients.length = 0
    })

    async function connect() {
        const context = new Context()
        context.register(1, defineMessageSchema({ text: Binary.String }))
        const instance = new Instance(context)
        instance.onConnect = async () => true
        const adapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
        const socket = adapter.createMockConnect()
        const client = new Client(context, LocalClientAdapter, 20, { binary: testBinaryAdapter })
        clients.push(client)
        const errors: unknown[] = []
        client.setWebsocketErrorHandler(error => errors.push(error))
        client.setDisconnectHandler(() => {})
        await client.connect(socket.clientSocket)
        const user = [...instance.users.values()][0]
        const queue = (channelId: number, text: string) => {
            user.queueChannelMessage(channelId, { ntype: 1, text })
            user.queueChannelInterpolatedMessage(channelId, { ntype: 1, text })
        }
        const step = () => {
            instance.step()
            const frames = client.network.drainFrames()
            expect(errors).toEqual([])
            return frames[frames.length - 1]
        }
        return { instance, user, client, queue, step }
    }

    describe.each(channels)('%s', (_name, createChannel) => {
        it.each(['pending open', 'known channel', 'separate close frame'])('cancels old scoped messages across resubscription with %s', async cadence => {
            const { instance, user, queue, step } = await connect()
            const channel = createChannel(instance)
            const other = new Channel(instance.localState)
            const view = new AABB3D(0, 0, 0, 100, 100, 100)
            channel.subscribe(user, view)
            other.subscribe(user)
            if (cadence !== 'pending open') step()
            queue(channel.nid, 'old subscription')
            channel.unsubscribe(user)
            queue(channel.nid, 'between subscriptions')
            if (cadence === 'separate close frame') step()
            channel.subscribe(user, view)
            queue(channel.nid, 'new:1')
            queue(other.nid, 'other:1')
            queue(channel.nid, 'new:2')
            queue(other.nid, 'other:2')
            user.queueMessage({ ntype: 1, text: 'top-level' })

            const frame = step()
            expect(frame.requireChannel(channel.nid).messages.map(message => message.text)).toEqual(['new:1', 'new:2'])
            expect(frame.requireChannel(channel.nid).interpolatedMessages.map(message => message.text)).toEqual(['new:1', 'new:2'])
            expect(frame.requireChannel(other.nid).messages.map(message => message.text)).toEqual(['other:1', 'other:2'])
            expect(frame.requireChannel(other.nid).interpolatedMessages.map(message => message.text)).toEqual(['other:1', 'other:2'])
            expect(frame.messages.map(message => message.text)).toEqual(['top-level'])
            expect(user.scopedMessageQueue).toEqual([])
            expect(user.scopedInterpolatedMessageQueue).toEqual([])
        })
    })

    it('cancels only the departing channel queues and preserves unrelated pending messages', async () => {
        const { instance, user, queue, step } = await connect()
        const departing = new Channel(instance.localState)
        const remaining = new Channel(instance.localState)
        departing.subscribe(user)
        remaining.subscribe(user)
        step()
        queue(remaining.nid, 'keep:1')
        queue(departing.nid, 'discard')
        queue(remaining.nid, 'keep:2')
        user.queueMessage({ ntype: 1, text: 'top-level' })
        user.queueInterpolatedMessage({ ntype: 1, text: 'top-level-fx' })
        departing.unsubscribe(user)
        const frame = step()
        expect(frame.requireChannel(remaining.nid).messages.map(message => message.text)).toEqual(['keep:1', 'keep:2'])
        expect(frame.requireChannel(remaining.nid).interpolatedMessages.map(message => message.text)).toEqual(['keep:1', 'keep:2'])
        expect(frame.messages.map(message => message.text)).toEqual(['top-level'])
        expect(frame.interpolatedMessages.map(message => message.text)).toEqual(['top-level-fx'])
        expect(user.scopedMessageQueue).toEqual([])
        expect(user.scopedInterpolatedMessageQueue).toEqual([])
    })

    it.each([Channel2D, EcsChannel3D])('cancels spatial messages already routed to the old subscription through %p', ChannelType => {
        return connect().then(({ instance, user, step }) => {
            const channel = new ChannelType(instance.localState, 50)
            const view = new AABB3D(0, 0, 0, 100, 100, 100)
            channel.subscribe(user, view)
            step()
            const old = { ntype: 1, text: 'old spatial event', x: 0, y: 0, z: 0 }
            channel.addMessage(old)
            channel.addInterpolatedMessage(old)
            expect(user.scopedMessageQueue).toHaveLength(1)
            channel.unsubscribe(user)
            channel.subscribe(user, view)
            const current = { ...old, text: 'new spatial event' }
            channel.addMessage(current)
            channel.addInterpolatedMessage(current)
            const frame = step().requireChannel(channel.nid)
            expect(frame.messages.map(message => message.text)).toEqual(['new spatial event'])
            expect(frame.interpolatedMessages.map(message => message.text)).toEqual(['new spatial event'])
        })
    })

    it('does not retain messages for absent subscriptions or after disconnect', async () => {
        const { instance, user, client, queue } = await connect()
        const channel = new Channel(instance.localState)
        queue(channel.nid, 'not subscribed')
        expect(user.scopedMessageQueue).toEqual([])
        expect(user.scopedInterpolatedMessageQueue).toEqual([])
        channel.subscribe(user)
        queue(channel.nid, 'pending')
        client.disconnect()
        queue(channel.nid, 'late async completion')
        expect(user.subscriptions.size).toBe(0)
        expect(user.scopedMessageQueue).toEqual([])
        expect(user.scopedInterpolatedMessageQueue).toEqual([])
    })

    it('clears retained message references immediately when a subscribed channel is destroyed', async () => {
        const { instance, user, queue } = await connect()
        const channel = new Channel(instance.localState)
        channel.subscribe(user)
        queue(channel.nid, 'destroyed')
        channel.destroy()
        expect(user.scopedMessageQueue).toEqual([])
        expect(user.scopedInterpolatedMessageQueue).toEqual([])
    })

    it('does not deliver a destroyed channel message to a replacement using its id', async () => {
        const { instance, user, queue, step } = await connect()
        const old = new Channel(instance.localState)
        old.subscribe(user)
        step()
        queue(old.nid, 'old channel')
        old.destroy()
        step()
        instance.localState.nidPool.current = old.nid - 1
        const replacement = new Channel(instance.localState)
        expect(replacement.nid).toBe(old.nid)
        replacement.subscribe(user)
        queue(replacement.nid, 'replacement')
        const frame = step().requireChannel(replacement.nid)
        expect(frame.messages.map(message => message.text)).toEqual(['replacement'])
        expect(frame.interpolatedMessages.map(message => message.text)).toEqual(['replacement'])
    })

    it('ignores stale unsubscribe calls from a destroyed channel whose id has been reused', async () => {
        const { instance, user, queue, step } = await connect()
        const old = new Channel(instance.localState)
        old.subscribe(user)
        step()
        old.destroy()
        step()
        instance.localState.nidPool.current = old.nid - 1
        const replacement = new Channel(instance.localState)
        replacement.subscribe(user)
        queue(replacement.nid, 'keep')
        old.unsubscribe(user)
        expect(user.subscriptions.get(replacement.nid)).toBe(replacement)
        expect(step().requireChannel(replacement.nid).messages.map(message => message.text)).toEqual(['keep'])
    })
})
