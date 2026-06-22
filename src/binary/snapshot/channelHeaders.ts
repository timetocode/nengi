import { hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { IChannel } from '../../server/channel/IChannel'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { SnapshotPlan } from './SnapshotPlan'

export function addPendingChannelHeader(plan: SnapshotPlan, user: User, instance: Instance, channel: IChannel) {
    const header = channel.header
    const headerVersion = channel.headerVersion || 0
    if (!hasSchemaBackedChannelHeader(header) || headerVersion <= 0) {
        return
    }

    const knownVersion = user.knownChannelHeaderVersions.get(channel.nid)
    const nschema = instance.context.getSchema(header.ntype)!
    if (!nschema) {
        throw new Error(`Channel header [nid ${header.nid}] [ntype ${header.ntype}] is missing a network schema.`)
    }

    if (knownVersion === undefined) {
        if (!instance.cache.cacheContains(header.nid)) {
            instance.cache.cacheify(instance.tick, header, nschema)
        }
        plan.channelHeaderVersions.push({ channelId: channel.nid, version: headerVersion })
        return
    }

    if (knownVersion >= headerVersion) {
        return
    }

    const diffs = instance.cache.getAndDiffGrouped(instance.tick, header, nschema)
    if (diffs.changes.length > 0 || diffs.groups.length > 0) {
        plan.channelHeaderUpdates.push({
            channelId: channel.nid,
            changes: diffs.changes,
            groups: diffs.groups
        })
    }
    plan.channelHeaderVersions.push({ channelId: channel.nid, version: headerVersion })
}

export function addPendingChannelHeaders(plan: SnapshotPlan, user: User, instance: Instance) {
    for (const channel of user.subscriptions.values()) {
        addPendingChannelHeader(plan, user, instance, channel)
    }
}
