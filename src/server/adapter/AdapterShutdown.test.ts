import { Context } from '../../common/Context'
import { NetworkEvent } from '../../common/binary/NetworkEvent'
import { Client } from '../../client/Client'
import { Instance } from '../Instance'
import { Channel } from '../channel/Channel'
import { LocalClientAdapter, LocalInstanceAdapter } from './MockAdapter'
import { testBinaryAdapter as binary } from '../../testSupport/BufferBinary'

test('shutdown scopes cleanup to its adapter, including an unfinished handshake', async () => {
    const instance = new Instance(new Context())
    let accept!: (value: any) => void
    instance.onConnect = handshake => handshake.pending
        ? new Promise(resolve => { accept = resolve })
        : Promise.resolve({})
    const closing = new LocalInstanceAdapter(instance.adapterHost, { binary })
    const staying = new LocalInstanceAdapter(instance.adapterHost, { binary })
    const connect = async (adapter: LocalInstanceAdapter<any, any>) => {
        const client = new Client(instance.context, LocalClientAdapter, 20, { binary })
        const closed = jest.fn()
        client.setDisconnectHandler(closed)
        await client.connect(adapter.createMockConnect().clientSocket)
        return { client, closed }
    }
    const a = await connect(closing)
    const b = await connect(staying)
    const users = [...instance.users.values()]
    const channel = new Channel(instance.localState)
    for (const user of users) channel.subscribe(user)
    instance.queue.clear()

    const pending = new Client(instance.context, LocalClientAdapter, 20, { binary })
    const attempted = pending.connect(closing.createMockConnect().clientSocket, { pending: true })
    const rejected = expect(attempted).rejects.toMatchObject({ code: 'REMOTE_CLOSE', detail: 'Maintenance' })
    expect(instance.network.pendingUsers.size).toBe(1)
    const completion = closing.shutdown('Maintenance')
    expect(closing.shutdown()).toBe(completion)
    expect(instance.network.pendingUsers.size).toBe(0)
    expect([...instance.users.values()]).toEqual([users[1]])
    expect(users[0].subscriptions.size).toBe(0)
    expect(users[1].subscriptions.size).toBe(1)
    expect(a.closed).toHaveBeenCalledTimes(1)
    expect(b.closed).not.toHaveBeenCalled()
    expect(instance.queue.next()?.type).toBe(NetworkEvent.UserDisconnected)
    expect(instance.queue.isEmpty()).toBe(true)
    accept({ late: true })
    await rejected
    await completion
    await Promise.resolve()
    expect(instance.users.size).toBe(1)
    expect(instance.queue.isEmpty()).toBe(true)
    expect(() => closing.listen()).toThrow(/shut down/)
    await expect(pending.connect(closing.createMockConnect().clientSocket)).rejects.toMatchObject({ code: 'TRANSPORT_ERROR' })
    await staying.shutdown()
})

test('shutdown before listen closes future local admissions without a lifecycle event', async () => {
    const instance = new Instance(new Context())
    instance.onConnect = jest.fn(async () => ({}))
    const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary })
    await adapter.shutdown()
    const client = new Client(instance.context, LocalClientAdapter, 20, { binary })
    await expect(client.connect(adapter.createMockConnect().clientSocket)).rejects.toMatchObject({ code: 'TRANSPORT_ERROR' })
    expect(instance.onConnect).not.toHaveBeenCalled()
    expect(instance.network.pendingUsers.size).toBe(0)
    expect(instance.queue.isEmpty()).toBe(true)
})
