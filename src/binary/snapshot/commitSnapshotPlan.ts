import { User } from '../../server/User'
import { SnapshotPlan } from './SnapshotPlan'

export function commitSnapshotPlan(user: User, plan: SnapshotPlan) {
    for (let i = 0; i < plan.channelOpens.length; i++) {
        user.knownChannelIds.add(plan.channelOpens[i].channelId)
    }

    for (let i = 0; i < plan.channelHeaderVersions.length; i++) {
        user.knownChannelHeaderVersions.set(
            plan.channelHeaderVersions[i].channelId,
            plan.channelHeaderVersions[i].version
        )
    }

    for (let i = 0; i < plan.channelCloses.length; i++) {
        user.knownChannelIds.delete(plan.channelCloses[i].channelId)
        user.knownChannelHeaderVersions.delete(plan.channelCloses[i].channelId)
    }

    if (plan.responses.length === 0) {
        return
    }

    const sentResponses = new Set(plan.responses)
    user.responseQueue = user.responseQueue.filter(response => !sentResponses.has(response))
}
