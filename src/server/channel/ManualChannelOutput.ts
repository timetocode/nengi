import { ProtocolConfig } from '../../common/binary/Protocol'
import { Instance } from '../Instance'
import { User } from '../User'
import { createEmptySnapshotPlan, SnapshotPlan } from '../../binary/snapshot/SnapshotPlan'
import {
    createSnapshotChunk,
    createSnapshotPlanChunk,
    SnapshotChunk
} from '../../binary/snapshot/SnapshotChunk'
import {
    countManualGroupedProps,
    countManualUpdateBytes,
    writeManualUpdates
} from '../../binary/snapshot/manualUpdates'
import { coalesceManualUpdateLog } from './EcsSpatialManualLog'
import {
    createChannelScopeChunk,
    createPayloadCopyChunk
} from '../../binary/snapshot/snapshotChunkBuilders'
import { addChannelMessages } from '../../binary/snapshot/channelMessages'
import { countPlanMessages } from '../../binary/snapshot/snapshotPlanStats'
import { addRegularCreate } from '../../binary/snapshot/entitySnapshotPlans'
import {
    ChannelSnapshotOutput,
    createChunkedChannelSnapshotOutput
} from './ChannelSnapshotOutput'
import { ManualChannel } from './ManualChannel'

function hasManualChannelCrud(plan: SnapshotPlan) {
    return plan.createEntities.length > 0 || plan.deleteEntities.length > 0
}

function hasPlanContent(plan: SnapshotPlan) {
    return plan.createEntities.length > 0 ||
        plan.updateEntities.length > 0 ||
        plan.updateEntityGroups.length > 0 ||
        plan.deleteEntities.length > 0 ||
        plan.messages.length > 0 ||
        plan.interpolatedMessages.length > 0
}

function addManualUpdates(plan: SnapshotPlan, instance: Instance, channel: ManualChannel, visibleUpdates: Set<number>) {
    for (let i = 0; i < channel.manualPropNids.length; i++) {
        const nid = channel.manualPropNids[i]
        if (!visibleUpdates.has(nid)) {
            continue
        }
        const entity = instance.localState.getByNid(nid)
        if (!entity) {
            continue
        }
        const prop = channel.manualPropSchemas[i]
        plan.updateEntities.push({
            nid,
            nschema: instance.context.getSchema(entity.ntype)!,
            prop: prop.prop,
            value: channel.manualPropValues[i]
        })
    }

    for (let i = 0; i < channel.manualGroupNids.length; i++) {
        const nid = channel.manualGroupNids[i]
        if (!visibleUpdates.has(nid)) {
            continue
        }
        const entity = instance.localState.getByNid(nid)
        if (!entity) {
            continue
        }
        const group = channel.manualGroupSchemas[i]
        const values = []
        let offset = channel.manualGroupValueOffsets[i]
        for (let j = 0; j < group.props.length; j++) {
            values.push(channel.manualGroupValues[offset++])
        }
        plan.updateEntityGroups.push({
            nid,
            nschema: instance.context.getSchema(entity.ntype)!,
            group,
            values
        })
    }
}

function getManualUpdateChannelFragment(user: User, instance: Instance, channel: ManualChannel, protocol: ProtocolConfig) {
    const key = `${instance.tick}:${channel.nid}:manual:${protocol.nidType}:${protocol.ntypeType}`
    const cached = instance.network.sharedUpdateFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached
    }

    const measure = instance.network.snapshotPerformanceEnabled
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0

    if (measure) {
        countStart = performance.now()
    }
    const bytes = countManualUpdateBytes(channel, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }
    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeManualUpdates(channel, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    const fragment = {
        payload: writer.payload,
        bytes,
        updateProps: channel.manualPropNids.length,
        updateGroups: channel.manualGroupNids.length,
        groupedUpdateProps: countManualGroupedProps(channel)
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

export function createManualChannelOutput(
    user: User,
    instance: Instance,
    channel: ManualChannel,
    protocol: ProtocolConfig
): ChannelSnapshotOutput {
    const visibility = channel.collectSnapshotVisibility(user)
    coalesceManualUpdateLog(channel)
    const plan = createEmptySnapshotPlan()
    for (let i = 0; i < visibility.toCreate.length; i++) {
        addRegularCreate(plan, instance, visibility.toCreate[i])
    }
    plan.deleteEntities = visibility.toDelete
    addChannelMessages(plan, user, channel, true)
    const writeManualLogDirectly = !hasManualChannelCrud(plan)
    if (!writeManualLogDirectly) {
        addManualUpdates(plan, instance, channel, new Set(visibility.toUpdate))
    }
    const fragment = writeManualLogDirectly &&
        instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites
        ? getManualUpdateChannelFragment(user, instance, channel, protocol)
        : null

    const chunks: SnapshotChunk[] = [
        createChannelScopeChunk(channel.nid, protocol)
    ]
    if (hasPlanContent(plan)) {
        chunks.push(createSnapshotPlanChunk('ManualChannelMessages', plan, instance.context, protocol))
    }
    if (fragment) {
        chunks.push(createPayloadCopyChunk('ManualUpdateFragment', instance, fragment.payload, fragment.bytes))
    } else if (writeManualLogDirectly) {
        chunks.push(createSnapshotChunk('ManualUpdates', countManualUpdateBytes(channel, protocol), writer => {
            writeManualUpdates(channel, writer, protocol)
        }))
    }

    return createChunkedChannelSnapshotOutput({
        channelId: channel.nid,
        chunks,
        stats: {
            creates: plan.createEntities.length,
            updateProps: fragment ? fragment.updateProps :
                writeManualLogDirectly ? channel.manualPropNids.length : plan.updateEntities.length,
            updateGroups: fragment ? fragment.updateGroups :
                writeManualLogDirectly ? channel.manualGroupNids.length : plan.updateEntityGroups.length,
            groupedUpdateProps: fragment ? fragment.groupedUpdateProps :
                writeManualLogDirectly ? countManualGroupedProps(channel) :
                    plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0),
            deletes: plan.deleteEntities.length,
            messages: countPlanMessages(plan),
            usedSharedFragments: !!fragment
        },
        commit() {
            channel.rememberSnapshotVisibility(user.id, visibility)
        }
    })
}
