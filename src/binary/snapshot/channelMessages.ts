import { User } from '../../server/User'
import { SnapshotPlan } from './SnapshotPlan'

type ChannelMessageQueues = {
    nid: number
    broadcastMessages?: any[]
    interpolatedBroadcastMessages?: any[]
}

export function addChannelMessages(
    plan: SnapshotPlan,
    user: User,
    channel: ChannelMessageQueues,
    includeBroadcastMessages: boolean
) {
    if (includeBroadcastMessages) {
        const broadcastMessages = channel.broadcastMessages
        if (broadcastMessages && broadcastMessages.length > 0) {
            plan.messages.push(...broadcastMessages)
        }
        const interpolatedBroadcastMessages = channel.interpolatedBroadcastMessages
        if (interpolatedBroadcastMessages && interpolatedBroadcastMessages.length > 0) {
            plan.interpolatedMessages.push(...interpolatedBroadcastMessages)
        }
    } else {
        const interpolatedBroadcastMessages = channel.interpolatedBroadcastMessages
        if (interpolatedBroadcastMessages && interpolatedBroadcastMessages.length > 0) {
            plan.interpolatedMessages.push(...interpolatedBroadcastMessages)
        }
    }
    addScopedQueuedMessages(plan, user, channel.nid)
}

function addScopedQueuedMessages(plan: SnapshotPlan, user: User, channelId: number) {
    for (let i = user.scopedMessageQueue.length - 1; i >= 0; i--) {
        const queued = user.scopedMessageQueue[i]
        if (queued.channelId !== channelId) {
            continue
        }
        plan.messages.push(queued.message)
        user.scopedMessageQueue.splice(i, 1)
    }
    for (let i = user.scopedInterpolatedMessageQueue.length - 1; i >= 0; i--) {
        const queued = user.scopedInterpolatedMessageQueue[i]
        if (queued.channelId !== channelId) {
            continue
        }
        plan.interpolatedMessages.push(queued.message)
        user.scopedInterpolatedMessageQueue.splice(i, 1)
    }
}
