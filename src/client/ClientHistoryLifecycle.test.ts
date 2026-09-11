import { ChannelType, createChannelHeader } from '../common/ChannelHeader'
import { createInterpolationTestClient, createTestSnapshot } from './InterpolationTestHarness'
import { Snapshot } from './Snapshot'
import { SnapshotChannel } from '../binary/snapshot/SnapshotPlan'

const entity = (nid: number, x: number) => ({ nid, ntype: 1, x, y: 0, label: 'live' })
const channel = (channelId: number, values: Partial<SnapshotChannel> = {}): SnapshotChannel => ({
    channelId, messages: [], interpolatedMessages: [], ecsCreateEntities: [],
    ecsCreateComponents: [], ecsDeleteEntities: [], createEntities: [],
    updateEntities: [], updateEntityGroups: [], deleteEntities: [], ...values
})
const spawn = (x: number): Partial<Snapshot> => ({
    channelOpens: [
        { channelId: 10, header: createChannelHeader(10, ChannelType.Channel) },
        { channelId: 20, header: createChannelHeader(20, ChannelType.EcsChannel) }
    ],
    channels: [
        channel(10, { createEntities: [entity(1, x)] }),
        channel(20, { ecsCreateEntities: [100], ecsCreateComponents: [{ ...entity(101, x), pid: 100 }] })
    ]
})
const closes = [{ channelId: 10 }, { channelId: 20 }]

test('history expires all lifecycle paths through queued frames, close/open reuse and a shorter retention window', () => {
    const client = createInterpolationTestClient()
    client.network.maxFrameHistory = 8
    const snapshots: Partial<Snapshot>[] = [
        spawn(1),
        { channels: [channel(10, { updateEntities: [{ nid: 1, prop: 'x', value: 2 }] }),
            channel(20, { updateEntities: [{ nid: 101, prop: 'x', value: 2 }] })] },
        { channels: [channel(10, { deleteEntities: [1] }), channel(20, { ecsDeleteEntities: [100] })] },
        { channelCloses: closes, ...spawn(4) },
        { channelCloses: closes, ...spawn(5) },
        {}, {}, {}, {}, {}, {},
        { channelCloses: closes }, {}, {}, {}, {}, {},
        spawn(18),
        { channels: [channel(20, { deleteEntities: [101] })] },
        { channelCloses: closes }, {}, {}, {}, {}, {}
    ]
    snapshots.forEach((snapshot, i) => client.network.queueSnapshot(createTestSnapshot(snapshot), i * 50))
    const frames = client.network.drainFrames(9)
    expect(frames).toHaveLength(9)
    expect(frames[2].requireChannel(20).deleteEntities).toEqual([101])
    expect(frames[4].closedChannels.flatMap(closed => closed.entityNids)).toEqual(expect.arrayContaining([1, 100, 101]))
    const history = client.network.store.history
    expect(history.getAt(1, 2)!.x).toBe(2)
    expect(history.getAt(1, 3)).toBeNull()
    expect(history.getAt(101, 4)!.x).toBe(4)
    expect(history.getAt(101, 5)!.x).toBe(5)

    client.network.maxFrameHistory = 2
    client.network.processNextFrame()
    expect(history.getStats().retainedRecords).toBe(2)
    expect(history.getAt(1, 4)).toBeNull()
    expect(history.getAt(101, 9)!.x).toBe(5)
    client.network.drainFrames()
    expect(client.network.store.entities.size).toBe(0)
    expect(history.getStats()).toEqual({ timelines: 0, records: 0, retainedRecords: 0 })
    // Expiration metadata must release its IDs as well as the timelines.
    expect((history as any).expirationNids.size).toBe(0)
    expect((history as any).spareExpirationBucket).toBeUndefined()
})
