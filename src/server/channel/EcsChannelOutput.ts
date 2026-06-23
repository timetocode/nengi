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
import { EcsChannel } from './EcsChannel'
import { coalesceEcsSpatialManualUpdateLog } from './EcsSpatialManualLog'

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

function addEcsManualUpdates(plan: SnapshotPlan, instance: Instance, channel: EcsChannel, visibleUpdates: Set<number>) {
    for (let i = 0; i < channel.manualPropNids.length; i++) {
        const nid = channel.manualPropNids[i]
        if (!visibleUpdates.has(nid)) {
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
        if (!visibleUpdates.has(nid)) {
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
    coalesceEcsSpatialManualUpdateLog(channel)
    const plan = createEmptySnapshotPlan()
    addEcsVisibilityCrud(plan, channel, visibility.toCreate, visibility.toDelete)
    addChannelMessages(plan, user, channel, true)

    const writeManualLogDirectly = !hasEcsSnapshotCrud(plan)
    if (!writeManualLogDirectly) {
        addEcsManualUpdates(plan, instance, channel, new Set(visibility.toUpdate))
    }
    const manualFragment = writeManualLogDirectly &&
        instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites
        ? getManualUpdateFragment(user, instance, channel, 'ecs-manual')
        : null

    const chunks: SnapshotChunk[] = [
        createChannelScopeChunk(channel.nid, protocol)
    ]
    if (hasSnapshotPlanContent(plan)) {
        chunks.push(createSnapshotPlanChunk('EcsChannelPlan', plan, instance.context, protocol))
    }
    if (manualFragment) {
        chunks.push(createPayloadCopyChunk('EcsManualUpdateFragment', instance, manualFragment.payload, manualFragment.bytes))
    } else if (writeManualLogDirectly) {
        chunks.push(createSnapshotChunk('EcsManualUpdates', countEcsManualUpdateBytes(channel, protocol), writer => {
            writeEcsManualUpdates(channel, writer, protocol)
        }))
    }

    return createChunkedChannelSnapshotOutput({
        channelId: channel.nid,
        chunks,
        stats: {
            creates: plan.ecsCreateEntities.length + plan.ecsCreateComponents.length,
            updateProps: manualFragment ? manualFragment.updateProps :
                writeManualLogDirectly ? channel.manualPropNids.length : plan.updateEntities.length,
            updateGroups: manualFragment ? manualFragment.updateGroups :
                writeManualLogDirectly ? channel.manualGroupNids.length : plan.updateEntityGroups.length,
            groupedUpdateProps: manualFragment ? manualFragment.groupedUpdateProps :
                writeManualLogDirectly ? countManualGroupedProps(channel) :
                    plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0),
            deletes: plan.ecsDeleteEntities.length + plan.deleteEntities.length,
            messages: countPlanMessages(plan),
            usedSharedFragments: !!manualFragment
        },
        commit() {
            channel.rememberSnapshotVisibility(user.id, visibility)
        }
    })
}
