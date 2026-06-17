import { Instance } from '../../server/Instance'
import { BinaryPayload } from '../../common/binary/BinaryAdapter'
import { byteSizeOfNetworkType, ProtocolConfig } from '../../common/binary/Protocol'
import { createEmptySnapshotPlan } from './SnapshotPlan'
import { createSnapshotChunk, createSnapshotPlanChunk, SnapshotChunk } from './SnapshotChunk'
import { writeChannelScope } from './writeSnapshot'
import { writePayload } from './snapshotPayload'
import {
    getSharedMessageFragments,
    sumSharedMessageFragmentBytes,
    writeSharedMessageFragments
} from './messageFragments'
import { CellEntityFragment, sumCellFragmentBytes, writeCellFragments } from './cellEntityFragments'

export function createPayloadCopyChunk(label: string, instance: Instance, payload: BinaryPayload, bytes: number): SnapshotChunk {
    return createSnapshotChunk(label, bytes, writer => {
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, bytes)
        }
    })
}

export function createChannelScopeChunk(channelId: number, protocol: ProtocolConfig): SnapshotChunk {
    return createSnapshotChunk('ChannelScope', 1 + byteSizeOfNetworkType(protocol.nidType), writer => {
        writeChannelScope(channelId, writer, protocol)
    })
}

export function createSharedMessageFragmentChunk(instance: Instance, messageFragments: ReturnType<typeof getSharedMessageFragments>) {
    const protocol = instance.network.getProtocol()
    const bytes = sumSharedMessageFragmentBytes(messageFragments, protocol)
    if (bytes === 0) {
        return null
    }
    return createSnapshotChunk('MessageFragments', bytes, writer => {
        writeSharedMessageFragments(writer, instance, messageFragments)
    })
}

export function createProtocolPreludeChunk(instance: Instance, protocol: ProtocolConfig) {
    const plan = createEmptySnapshotPlan()
    plan.engineMessages = [instance.network.createProtocolEngineMessage()]
    return createSnapshotPlanChunk('ProtocolPrelude', plan, instance.context, protocol)
}

export function createCellFragmentChunk(label: string, instance: Instance, fragments: CellEntityFragment[]) {
    const bytes = sumCellFragmentBytes(fragments)
    if (bytes === 0) {
        return null
    }
    return createSnapshotChunk(label, bytes, writer => {
        writeCellFragments(writer, instance, fragments)
    })
}
