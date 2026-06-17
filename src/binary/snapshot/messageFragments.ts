import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { BinaryPayload } from '../../common/binary/BinaryAdapter'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { createEmptySnapshotPlan } from './SnapshotPlan'
import { countSnapshotBytes } from './countSnapshotBytes'
import { writeChannelScope, writeSnapshot } from './writeSnapshot'
import { isSharedMessageChannel, SharedMessageChannel } from './channelModes'
import { writePayload } from './snapshotPayload'
import { byteSizeOfNetworkType, ProtocolConfig } from '../../common/binary/Protocol'

type MessageFragment = {
    channelId: number
    payload: BinaryPayload
    bytes: number
    messages: number
}

export function collectBroadcastMessages(user: User) {
    const messages: any[] = []
    user.subscriptions.forEach((channel: any) => {
        if (isSharedMessageChannel(channel) && channel.broadcastMessages.length > 0) {
            for (let i = 0; i < channel.broadcastMessages.length; i++) {
                messages.push(channel.broadcastMessages[i])
            }
        }
    })
    return messages
}

export function collectInterpolatedBroadcastMessages(user: User) {
    const messages: any[] = []
    user.subscriptions.forEach((channel: any) => {
        if (isSharedMessageChannel(channel)) {
            const interpolated = channel.interpolatedBroadcastMessages
            if (!interpolated || interpolated.length === 0) {
                return
            }
            for (let i = 0; i < interpolated.length; i++) {
                messages.push(interpolated[i])
            }
        }
    })
    return messages
}

function getSharedMessageFragment(user: User, instance: Instance, channel: SharedMessageChannel): MessageFragment {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:${protocol.ntypeType}`
    const cached = instance.network.sharedMessageFragments.get(key)
    if (cached) {
        instance.network.recordSharedMessageFragmentHit()
        return cached as MessageFragment
    }

    const measure = instance.network.snapshotPerformanceEnabled
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0

    const plan = createEmptySnapshotPlan()
    plan.messages = channel.broadcastMessages

    if (measure) {
        countStart = performance.now()
    }
    const bytes = countSnapshotBytes(plan, instance.context, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeSnapshot(plan, instance.context, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    const fragment = {
        channelId: channel.nid,
        payload: writer.payload,
        bytes,
        messages: channel.broadcastMessages.length
    }
    instance.network.sharedMessageFragments.set(key, fragment)
    instance.network.recordSharedMessageFragmentBuild({ countMs, writeMs, bytes, messages: fragment.messages })
    return fragment
}

export function getSharedMessageFragments(user: User, instance: Instance) {
    if (instance.network.debugBinaryWrites) {
        return []
    }

    const fragments: MessageFragment[] = []
    user.subscriptions.forEach((channel: any) => {
        if (isSharedMessageChannel(channel) && channel.broadcastMessages.length > 0) {
            fragments.push(getSharedMessageFragment(user, instance, channel))
        }
    })
    return fragments
}

export function sumSharedMessageFragmentBytes(fragments: MessageFragment[], protocol: ProtocolConfig) {
    let bytes = 0
    for (let i = 0; i < fragments.length; i++) {
        bytes += 1 + byteSizeOfNetworkType(protocol.nidType) + fragments[i].bytes
    }
    return bytes
}

export function sumSharedMessageFragmentMessages(fragments: MessageFragment[]) {
    let messages = 0
    for (let i = 0; i < fragments.length; i++) {
        messages += fragments[i].messages
    }
    return messages
}

export function writeSharedMessageFragments(writer: IBinaryWriter, instance: Instance, fragments: MessageFragment[]) {
    const protocol = instance.network.getProtocol()
    for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i]
        writeChannelScope(fragment.channelId, writer, protocol)
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, fragment.payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedMessageFragmentCopy(performance.now() - copyStart, fragment.bytes)
        }
    }
}
