import { User } from '../../server/User'
import { hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { SnapshotPlan } from './SnapshotPlan'

export function commitSnapshotPlan(user: User, plan: SnapshotPlan) {
    for (let i = 0; i < plan.channelCloses.length; i++) {
        user.knownChannelIds.delete(plan.channelCloses[i].channelId)
        user.knownChannelHeaderVersions.delete(plan.channelCloses[i].channelId)
    }

    for (let i = 0; i < plan.channelOpens.length; i++) {
        const open = plan.channelOpens[i]
        user.knownChannelIds.add(open.channelId)
        if (hasSchemaBackedChannelHeader(open.header)) {
            user.knownChannelHeaderVersions.set(open.channelId, 1)
        }
    }

    for (let i = 0; i < plan.channelHeaderVersions.length; i++) {
        user.knownChannelHeaderVersions.set(
            plan.channelHeaderVersions[i].channelId,
            plan.channelHeaderVersions[i].version
        )
    }

    if (plan.responses.length === 0) {
        return
    }

    const sentResponses = new Set(plan.responses)
    user.responseQueue = user.responseQueue.filter(response => {
        if (!sentResponses.has(response)) return true
        user.instance?.network.releaseQueuedResponse(user, response)
        return false
    })
}
