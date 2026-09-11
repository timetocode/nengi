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
    collectScopedChannelMessages(user, channel.nid, plan.messages, plan.interpolatedMessages)
}

export function collectScopedChannelMessages(user: User, channelId: number, messages: any[], interpolatedMessages: any[]) {
    let retained = 0
    for (let i = 0; i < user.scopedMessageQueue.length; i++) {
        const queued = user.scopedMessageQueue[i]
        if (queued.channelId === channelId) {
            messages.push(queued.message)
        } else {
            user.scopedMessageQueue[retained++] = queued
        }
    }
    user.scopedMessageQueue.length = retained
    retained = 0
    for (let i = 0; i < user.scopedInterpolatedMessageQueue.length; i++) {
        const queued = user.scopedInterpolatedMessageQueue[i]
        if (queued.channelId === channelId) {
            interpolatedMessages.push(queued.message)
        } else {
            user.scopedInterpolatedMessageQueue[retained++] = queued
        }
    }
    user.scopedInterpolatedMessageQueue.length = retained
}
