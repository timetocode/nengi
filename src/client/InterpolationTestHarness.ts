import { Binary } from '../common/binary/Binary'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client } from './Client'
import { FixedStepInterpolator, FixedStepInterpolatorOptions } from './FixedStepInterpolator'
import { Snapshot } from './Snapshot'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { ChannelType, createChannelHeader } from '../common/ChannelHeader'

const TEST_CHANNEL_ID = 1

class MockAdapter {
    binary = testBinaryAdapter
    constructor() {
    }
    connect() {
        return Promise.resolve({ accepted: true })
    }
    flush() {
    }
}

export function createInterpolationTestContext() {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: { type: Binary.Float64, interp: true },
        y: { type: Binary.Float64, interp: true },
        label: Binary.String
    }))
    return context
}

export function createTestSnapshot(args: Partial<Snapshot>): Snapshot {
    const createEntities = args.createEntities || []
    const updateEntities = args.updateEntities || []
    const deleteEntities = args.deleteEntities || []
    const hasEntityCrud = createEntities.length > 0 || updateEntities.length > 0 || deleteEntities.length > 0
    const channels = args.channels || (hasEntityCrud ? [{
        channelId: TEST_CHANNEL_ID,
        messages: [],
        interpolatedMessages: [],
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        createEntities,
        updateEntities,
        updateEntityGroups: [],
        deleteEntities
    }] : [])

    return {
        timestamp: -1,
        confirmedClientTick: -1,
        messages: [],
        ...args,
        channelOpens: args.channelOpens || (hasEntityCrud
            ? [{ channelId: TEST_CHANNEL_ID, header: createChannelHeader(TEST_CHANNEL_ID, ChannelType.Channel) }]
            : []),
        channels,
        createEntities: [],
        updateEntities: [],
        deleteEntities: []
    }
}

export function createInterpolationTestClient(tickRate = 20) {
    return new Client(createInterpolationTestContext(), MockAdapter, tickRate)
}

export function applyTestSnapshot(client: Client, snapshot: Partial<Snapshot>, receivedAt: number) {
    const fullSnapshot = createTestSnapshot(snapshot)
    const frame = client.network.store.applySnapshot(fullSnapshot, client.network.frameTick, receivedAt)
    client.network.frameTick++
    client.network.frames.push(frame)
    client.network.latestFrame = frame
    client.network.previousSnapshot = fullSnapshot
    return frame
}

export class InterpolationTestHarness {
    context: Context
    client: Client
    interpolator: FixedStepInterpolator
    now: number

    constructor(options: FixedStepInterpolatorOptions = {}, now = 1000, tickRate = 20) {
        this.context = createInterpolationTestContext()
        this.client = new Client(this.context, MockAdapter, tickRate)
        this.interpolator = new FixedStepInterpolator(this.client, options)
        this.now = now
    }

    advance(ms: number) {
        this.now += ms
        return this.now
    }

    receive(snapshot: Partial<Snapshot>, receivedAt = this.now) {
        return applyTestSnapshot(this.client, snapshot, receivedAt)
    }

    receiveMovingFrames(receivedAtStart: number, count = 4, spacingMs = 50) {
        for (let i = 0; i < count; i++) {
            this.receive({
                timestamp: 1000 + (i * spacingMs),
                createEntities: i === 0 ? [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }] : [],
                updateEntities: i > 0 ? [{ nid: 1, prop: 'x', value: i * 10 }] : []
            }, receivedAtStart + (i * spacingMs))
        }
    }

    sample(interpDelay: number, now = this.now) {
        this.now = now
        return this.interpolator.sample(interpDelay, this.now)
    }
}
