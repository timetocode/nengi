import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { collectSkipInterpolationNids, MAX_RESPONSES_PER_FRAME } from './snapshotEnvelope'
import { commitSnapshotPlan } from './commitSnapshotPlan'
import { countSnapshotBytes } from './countSnapshotBytes'
import { writeSnapshot } from './writeSnapshot'
import { EMPTY_SNAPSHOT_ARRAY, EMPTY_SNAPSHOT_PLAN, ReadonlySnapshotPlan, SnapshotPlan } from './SnapshotPlan'
import {
    createSnapshotPlanChunk,
    SnapshotChunk,
    sumSnapshotChunkBytes,
    writeSnapshotChunks
} from './SnapshotChunk'
import { countPlanMessages } from './snapshotPlanStats'
import {
    createProtocolPreludeChunk
} from './snapshotChunkBuilders'
import { addPendingChannelHeaders } from './channelHeaders'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { ChannelSnapshotOutput } from '../../server/channel/ChannelSnapshotOutput'
import { SNAPSHOT_HEADER_BYTES, writeSnapshotHeader } from './snapshotHeader'
import { assertBinaryWriteSize } from '../assertBinaryWriteSize'

type SnapshotPing = { ntype: number, pingId: number, latency: number, serverTimeMs: number }

type EnvelopePlan = ReadonlySnapshotPlan & Pick<SnapshotPlan,
    'channelOpens' | 'channelCloses' | 'channelHeaderUpdates' | 'channelHeaderVersions'>

type SnapshotOutputChannel = {
    nid: number
    channelType?: number
    ecsCulledChannelMode?: true
    cellFragmentMode?: true
    ecsChannelMode?: true
    manualUpdateChannelMode?: true
    createSnapshotOutput(user: User, instance: Instance, protocol: ProtocolConfig): ChannelSnapshotOutput
}

function getSubscribedOutputChannels(user: User): SnapshotOutputChannel[] | null {
    const channels: SnapshotOutputChannel[] = []
    for (const channel of user.subscriptions.values()) {
        const candidate = channel as any
        if (typeof candidate.createSnapshotOutput !== 'function') {
            return null
        }
        channels.push(candidate)
    }
    return channels
}

function collectEnvelopePlan(user: User, instance: Instance) {
    const plan: EnvelopePlan = {
        ...EMPTY_SNAPSHOT_PLAN,
        channelOpens: [],
        channelCloses: [],
        channelHeaderUpdates: [],
        channelHeaderVersions: []
    }
    const queuedResponses = user.responseQueue.length
    addEnvelopeQueues(plan, user, instance)
    return { plan, queuedResponses }
}

function addEnvelopeQueues(plan: EnvelopePlan, user: User, instance?: Instance) {
    const channelOpens = user.hasPendingChannelOpens() ? user.consumePendingChannelOpens() : EMPTY_SNAPSHOT_ARRAY
    for (let i = 0; i < channelOpens.length; i++) {
        const channel = user.subscriptions.get(channelOpens[i])
        if (channel) {
            if (instance && hasSchemaBackedChannelHeader(channel.header)) {
                const nschema = instance.context.getSchema(channel.header.ntype)!
                if (!instance.cache.cacheContains(channel.header.nid)) {
                    instance.cache.cacheify(instance.tick, channel.header, nschema)
                }
            }
            plan.channelOpens.push({ channelId: channel.nid, header: channel.header })
        }
    }
    const channelCloses = user.hasPendingChannelCloses() ? user.consumePendingChannelCloses() : EMPTY_SNAPSHOT_ARRAY
    for (let i = 0; i < channelCloses.length; i++) {
        plan.channelCloses.push({ channelId: channelCloses[i] })
    }
    // Detach nonempty queues; leave empty user queues available for later sends.
    // The plan's immutable empty sections cannot see messages queued by a writer.
    if (user.engineMessageQueue.length > 0) {
        plan.engineMessages = user.engineMessageQueue
        user.engineMessageQueue = []
    }
    plan.skipInterpolationNids = collectSkipInterpolationNids(user)
    if (instance) {
        addPendingChannelHeaders(plan, user, instance)
    }
    if (user.messageQueue.length > 0) {
        plan.messages = user.messageQueue
        user.messageQueue = []
    }
    if (user.interpolatedMessageQueue.length > 0) {
        plan.interpolatedMessages = user.interpolatedMessageQueue
        user.interpolatedMessageQueue = []
    }
    if (user.responseQueue.length > 0) {
        plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)
    }
}

function protocolWillChange(user: User, protocol: ProtocolConfig) {
    return user.protocol.nidType !== protocol.nidType || user.protocol.ntypeType !== protocol.ntypeType
}

function createChannelOutputsSnapshotBuffer(user: User, instance: Instance, channels: SnapshotOutputChannel[], serverTimeMs: number, ping?: SnapshotPing) {
    const measure = instance.network.snapshotPerformanceEnabled
    let collectStart = 0
    let collectMs = 0
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0
    let commitStart = 0
    let commitMs = 0

    if (measure) {
        collectStart = performance.now()
    }

    const protocol = instance.network.getProtocol()
    const needsProtocolPrelude = protocolWillChange(user, protocol)
    instance.network.queueProtocolIfChanged(user, protocol)
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user, instance)
    const channelOutputs: ChannelSnapshotOutput[] = []
    for (let i = 0; i < channels.length; i++) {
        channelOutputs.push(channels[i].createSnapshotOutput(user, instance, protocol))
    }

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const envelopeChunks: SnapshotChunk[] = []
    if (needsProtocolPrelude) {
        envelopeChunks.push(createProtocolPreludeChunk(instance, protocol))
    }
    envelopeChunks.push(createSnapshotPlanChunk('Envelope', envelope, instance.context, protocol))
    // Reserve a final engine section so its timestamp can be written after
    // snapshot preparation without seeking or patching adapter-owned buffers.
    let pingChunk: SnapshotChunk | undefined
    if (ping) {
        const pingPlan = { ...EMPTY_SNAPSHOT_PLAN, engineMessages: [ping] }
        pingChunk = createSnapshotPlanChunk('Ping', pingPlan, instance.context, protocol)
    }
    let channelBytes = 0
    for (let i = 0; i < channelOutputs.length; i++) {
        channelBytes += channelOutputs[i].bytes
    }
    const bytes = SNAPSHOT_HEADER_BYTES + sumSnapshotChunkBytes(envelopeChunks) + channelBytes + (pingChunk?.bytes ?? 0)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    const writeOptions = {
        diagnostic: instance.network.diagnosticBinaryWrites,
        createWriter: (byteLength: number) => user.networkAdapter.binary.createWriter(byteLength)
    }
    writeSnapshotHeader(serverTimeMs, writer)
    writeSnapshotChunks(envelopeChunks, writer, writeOptions)
    for (let i = 0; i < channelOutputs.length; i++) {
        channelOutputs[i].write(writer, writeOptions)
    }

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    commitSnapshotPlan(user, envelope)
    for (let i = 0; i < channelOutputs.length; i++) {
        channelOutputs[i].commit()
    }
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        const stats = {
            creates: 0,
            updateProps: 0,
            updateGroups: 0,
            groupedUpdateProps: 0,
            deletes: 0,
            messages: 0,
            usedSharedFragments: false
        }
        for (let i = 0; i < channelOutputs.length; i++) {
            const outputStats = channelOutputs[i].stats
            if (!outputStats) continue
            stats.creates += outputStats.creates
            stats.updateProps += outputStats.updateProps
            stats.updateGroups += outputStats.updateGroups
            stats.groupedUpdateProps += outputStats.groupedUpdateProps
            stats.deletes += outputStats.deletes
            stats.messages += outputStats.messages
            stats.usedSharedFragments = stats.usedSharedFragments || outputStats.usedSharedFragments
        }
        if (stats.usedSharedFragments) {
            instance.network.recordSharedSnapshot()
        }
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: stats.creates,
            updateProps: stats.updateProps,
            updateGroups: stats.updateGroups,
            groupedUpdateProps: stats.groupedUpdateProps,
            deletes: stats.deletes,
            messages: countPlanMessages(envelope) + stats.messages,
            engineMessages: envelope.engineMessages.length + (ping ? 1 : 0),
            responses: envelope.responses.length
        })
    }

    if (ping && pingChunk) {
        const sentAtMs = instance.now()
        if (!Number.isFinite(sentAtMs)) throw new Error('instance.now must return a finite monotonic server time.')
        ping.serverTimeMs = sentAtMs
        writeSnapshotChunks([pingChunk], writer, writeOptions)
        // Local transports can return a Pong synchronously from inside send().
        user.recordPingSent(ping.pingId, sentAtMs, sentAtMs)
    }
    assertBinaryWriteSize(writer, bytes, 'Snapshot')
    return writer.payload
}

const createSnapshotBuffer = (user: User, instance: Instance, serverTimeMs = instance.now(), ping?: SnapshotPing) => {
    const outputChannels = getSubscribedOutputChannels(user)
    if (!outputChannels) {
        throw new Error('All subscribed channels must implement createSnapshotOutput().')
    }
    return createChannelOutputsSnapshotBuffer(user, instance, outputChannels, serverTimeMs, ping)
}

export default createSnapshotBuffer
export { commitSnapshotPlan, countSnapshotBytes, writeSnapshot }
export type { SnapshotPlan, SnapshotResponse } from './SnapshotPlan'
