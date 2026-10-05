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
    collectManualGroupBatches,
    countEcsManualUpdateBytes,
    countManualGroupedProps,
    getManualUpdateFragment,
    writeEcsManualUpdates
} from '../../binary/snapshot/manualUpdates'
import {
    createChannelScopeChunk,
    createPayloadCopyChunk
} from '../../binary/snapshot/snapshotChunkBuilders'
import { addChannelMessages } from '../../binary/snapshot/channelMessages'
import { addEcsVisibilityCrud } from '../../binary/snapshot/ecsSnapshotCrud'
import { countPlanMessages } from '../../binary/snapshot/snapshotPlanStats'
import {
    ChannelSnapshotOutput,
    createChunkedChannelSnapshotOutput
} from './ChannelSnapshotOutput'
import { EcsChannel, EcsChannelSnapshotVisibility } from './EcsChannel'

function hasSnapshotPlanContent(plan: SnapshotPlan) {
    return plan.ecsCreateEntities.length > 0 ||
        plan.ecsCreateComponents.length > 0 ||
        plan.ecsDeleteEntities.length > 0 ||
        plan.createEntities.length > 0 ||
        plan.updateEntities.length > 0 ||
        plan.updateEntityGroups.length > 0 ||
        plan.deleteEntities.length > 0 ||
        plan.messages.length > 0 ||
        plan.interpolatedMessages.length > 0
}

function hasEcsSnapshotCrud(plan: SnapshotPlan) {
    return plan.ecsCreateEntities.length > 0 ||
        plan.ecsCreateComponents.length > 0 ||
        plan.createEntities.length > 0 ||
        plan.ecsDeleteEntities.length > 0 ||
        plan.deleteEntities.length > 0
}

function addEcsManualUpdates(plan: SnapshotPlan, instance: Instance, channel: EcsChannel, visibility: EcsChannelSnapshotVisibility) {
    const previousVisibleSet = visibility.previousVisibleSet
    if (!previousVisibleSet) return

    for (let i = 0; i < channel.manualPropNids.length; i++) {
        const nid = channel.manualPropNids[i]
        if (!previousVisibleSet.has(nid) || !visibility.visibleSet.has(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (!component) {
            continue
        }
        const prop = channel.manualPropSchemas[i]
        plan.updateEntities.push({
            nid,
            nschema: instance.context.getSchema(component.ntype)!,
            prop: prop.prop,
            value: channel.manualPropValues[i]
        })
    }

    for (let i = 0; i < channel.manualGroupNids.length; i++) {
        const nid = channel.manualGroupNids[i]
        if (!previousVisibleSet.has(nid) || !visibility.visibleSet.has(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (!component) {
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
            nschema: instance.context.getSchema(component.ntype)!,
            group,
            values
        })
    }
}

export function createEcsChannelOutput(
    user: User,
    instance: Instance,
    channel: EcsChannel,
    protocol: ProtocolConfig
): ChannelSnapshotOutput {
    const visibility = channel.collectSnapshotVisibility(user)
    channel.prepareManualUpdates()
    const needsPlan = visibility.toCreate.length > 0 || visibility.toDelete.length > 0 ||
        channel.broadcastMessages.length > 0 || channel.interpolatedBroadcastMessages.length > 0 ||
        user.scopedMessageQueue.length > 0 || user.scopedInterpolatedMessageQueue.length > 0
    const plan = needsPlan ? createEmptySnapshotPlan() : null
    if (plan) {
        addEcsVisibilityCrud(plan, channel, visibility.toCreate, visibility.toDelete)
        addChannelMessages(plan, user, channel, true)
    }

    const writeManualLogDirectly = !plan || !hasEcsSnapshotCrud(plan)
    if (plan && !writeManualLogDirectly) {
        addEcsManualUpdates(plan, instance, channel, visibility)
    }
    const manualFragment = writeManualLogDirectly &&
        instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.diagnosticBinaryWrites
        ? getManualUpdateFragment(user, instance, channel, 'ecs-manual', protocol)
        : null

    const chunks: SnapshotChunk[] = [
        createChannelScopeChunk(channel.nid, protocol)
    ]
    if (plan && hasSnapshotPlanContent(plan)) {
        chunks.push(createSnapshotPlanChunk('EcsChannelPlan', plan, instance.context, protocol))
    }
    if (manualFragment) {
        chunks.push(createPayloadCopyChunk('EcsManualUpdateFragment', instance, manualFragment.payload, manualFragment.bytes))
    } else if (writeManualLogDirectly) {
        const batches = collectManualGroupBatches(channel)
        chunks.push(createSnapshotChunk('EcsManualUpdates', countEcsManualUpdateBytes(channel, protocol, batches), writer => {
            writeEcsManualUpdates(channel, writer, protocol, batches)
        }))
    }

    return createChunkedChannelSnapshotOutput({
        channelId: channel.nid,
        chunks,
        stats: instance.network.snapshotPerformanceEnabled ? {
            creates: plan ? plan.ecsCreateEntities.length + plan.ecsCreateComponents.length : 0,
            updateProps: manualFragment ? manualFragment.updateProps :
                writeManualLogDirectly ? channel.manualPropNids.length : plan!.updateEntities.length,
            updateGroups: manualFragment ? manualFragment.updateGroups :
                writeManualLogDirectly ? channel.manualGroupNids.length : plan!.updateEntityGroups.length,
            groupedUpdateProps: manualFragment ? manualFragment.groupedUpdateProps :
                writeManualLogDirectly ? countManualGroupedProps(channel) :
                    plan!.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0),
            deletes: plan ? plan.ecsDeleteEntities.length + plan.deleteEntities.length : 0,
            messages: plan ? countPlanMessages(plan) : 0,
            usedSharedFragments: !!manualFragment
        } : null,
        commit() {
            channel.rememberSnapshotVisibility(user.id, visibility)
        }
    })
}
