import { User } from '../../server/User'
import { SnapshotPlan } from './SnapshotPlan'

export function commitSnapshotPlan(user: User, plan: SnapshotPlan) {
    if (plan.responses.length === 0) {
        return
    }

    const sentResponses = new Set(plan.responses)
    user.responseQueue = user.responseQueue.filter(response => !sentResponses.has(response))
}
