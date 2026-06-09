import { User } from '../../server/User'
import { SnapshotPlan } from './SnapshotPlan'

export function commitSnapshotPlan(user: User, plan: SnapshotPlan) {
    for (let i = 0; i < plan.channelHeaderVersions.length; i++) {
        user.knownChannelHeaderVersions.set(
            plan.channelHeaderVersions[i].channelId,
            plan.channelHeaderVersions[i].version
        )
    }

    for (let i = 0; i < plan.channelHeaderDeletes.length; i++) {
        user.knownChannelHeaderVersions.delete(plan.channelHeaderDeletes[i].channelId)
    }

    if (plan.responses.length === 0) {
        return
    }

    const sentResponses = new Set(plan.responses)
    user.responseQueue = user.responseQueue.filter(response => !sentResponses.has(response))
}
