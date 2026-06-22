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
    createChannelScopeChunk,
    createPayloadCopyChunk,
    createSharedMessageFragmentChunk
} from '../../binary/snapshot/snapshotChunkBuilders'
import { addChannelMessages } from '../../binary/snapshot/channelMessages'
import { countPlanMessages } from '../../binary/snapshot/snapshotPlanStats'
import {
    countEntityDeltaFragmentBytes,
    countEntityDeltaFragmentCreates,
    countEntityDeltaFragmentDeletes,
    getSharedCreateFragment,
    getSharedDeleteFragment,
    getSharedUpdateFragment,
    writeEntityDeltaFragments
} from '../../binary/snapshot/sharedEntityFragments'
import {
    getSharedMessageFragments,
    sumSharedMessageFragmentMessages
} from '../../binary/snapshot/messageFragments'
import { addRegularCreate, addRegularUpdate } from '../../binary/snapshot/entitySnapshotPlans'
import {
    ChannelSnapshotOutput,
    createChunkedChannelSnapshotOutput
} from './ChannelSnapshotOutput'
import type { Channel, ChannelSnapshotVisibility } from './Channel'

function hasPlanContent(plan: SnapshotPlan) {
    return plan.createEntities.length > 0 ||
        plan.updateEntities.length > 0 ||
        plan.updateEntityGroups.length > 0 ||
        plan.deleteEntities.length > 0 ||
        plan.messages.length > 0 ||
        plan.interpolatedMessages.length > 0
}

function addVisibilityPlan(plan: SnapshotPlan, instance: Instance, channel: Channel, visibility: ChannelSnapshotVisibility) {
    for (let i = 0; i < visibility.toCreate.length; i++) {
        addRegularCreate(plan, instance, visibility.toCreate[i])
    }
    for (let i = 0; i < visibility.toUpdate.length; i++) {
        addRegularUpdate(plan, instance, visibility.toUpdate[i])
    }
    plan.deleteEntities = visibility.toDelete
}

function canUseSharedDelta(channel: Channel, visibility: ChannelSnapshotVisibility) {
    return visibility.hasPrevious &&
        visibility.previousMembershipVersion === channel.deltaBaseVersion &&
        (channel.createdRoots.length > 0 || channel.deletedNids.length > 0)
}

export function createChannelOutput(
    user: User,
    instance: Instance,
    channel: Channel,
    protocol: ProtocolConfig
): ChannelSnapshotOutput {
    const plan = createEmptySnapshotPlan()
    const useSharedFragments = instance.network.sharedUpdateFragmentsEnabled && !instance.network.debugBinaryWrites
    const useSharedMessageFragments = !instance.network.debugBinaryWrites
    const visibility = useSharedFragments
        ? channel.collectChannelSharedDeltaVisibility(user) ?? channel.collectChannelSnapshotVisibility(user)
        : channel.collectChannelSnapshotVisibility(user)
    const useDeltaFragments = useSharedFragments && canUseSharedDelta(channel, visibility)
    const deltaFragments = useDeltaFragments
        ? {
            creates: getSharedCreateFragment(user, instance, channel),
            deletes: getSharedDeleteFragment(user, instance, channel)
        }
        : { creates: null, deletes: null }
    const excludedUpdateNids = deltaFragments.creates?.nids

    if (!useDeltaFragments) {
        addVisibilityPlan(plan, instance, channel, visibility)
    }

    const messageFragments = useSharedMessageFragments ? getSharedMessageFragments(user, instance) : []
    addChannelMessages(plan, user, channel, !useSharedMessageFragments)
    const updateFragment = useSharedFragments && visibility.hasPrevious
        ? getSharedUpdateFragment(user, instance, channel, excludedUpdateNids)
        : null

    const chunks: SnapshotChunk[] = []
    const deltaBytes = countEntityDeltaFragmentBytes(deltaFragments)
    if (deltaBytes > 0) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotChunk('ChannelEntityDeltaFragments', deltaBytes, writer => {
            writeEntityDeltaFragments(writer, instance, deltaFragments)
        }))
    }
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
    if (hasPlanContent(plan)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotPlanChunk('ChannelPlan', plan, instance.context, protocol))
    }
    if (updateFragment) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createPayloadCopyChunk('ChannelUpdateFragment', instance, updateFragment.payload, updateFragment.bytes))
    }

    return createChunkedChannelSnapshotOutput({
        channelId: channel.nid,
        chunks,
        stats: {
            creates: plan.createEntities.length + countEntityDeltaFragmentCreates(deltaFragments),
            updateProps: plan.updateEntities.length + (updateFragment?.updateProps || 0),
            updateGroups: plan.updateEntityGroups.length + (updateFragment?.updateGroups || 0),
            groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0) +
                (updateFragment?.groupedUpdateProps || 0),
            deletes: plan.deleteEntities.length + countEntityDeltaFragmentDeletes(deltaFragments),
            messages: countPlanMessages(plan) + sumSharedMessageFragmentMessages(messageFragments),
            usedSharedFragments: !!updateFragment || deltaBytes > 0 || messageFragments.length > 0
        },
        commit() {
            channel.rememberChannelSnapshotVisibility(user.id, visibility)
        }
    })
}
