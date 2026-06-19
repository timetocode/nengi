import { SnapshotPlan } from './SnapshotPlan'
import { EcsSnapshotChannel } from './channelModes'

export function addEcsVisibilityCrud(
    plan: SnapshotPlan,
    channel: EcsSnapshotChannel,
    toCreate: number[],
    toDelete: number[]
) {
    addEcsCreates(plan, channel, toCreate)
    addEcsDeletes(plan, channel, toDelete)
}

function addEcsCreates(plan: SnapshotPlan, channel: EcsSnapshotChannel, toCreate: number[]) {
    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i]
        if (channel.isRootNid(nid)) {
            plan.ecsCreateEntities.push(nid)
        } else if (channel.isComponentNid(nid)) {
            const component = channel.getComponent(nid)
            if (component) {
                plan.ecsCreateComponents.push(component)
            }
        }
    }
}

function addEcsDeletes(plan: SnapshotPlan, channel: EcsSnapshotChannel, toDelete: number[]) {
    const deletingRoots = new Set<number>()
    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i]
        if (channel.isRootNid(nid)) {
            deletingRoots.add(nid)
            plan.ecsDeleteEntities.push(nid)
        }
    }

    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i]
        if (channel.isRootNid(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (channel.isRootDeletedComponentNid(nid) || (component && deletingRoots.has(component.pid))) {
            continue
        }
        plan.deleteEntities.push(nid)
    }
}
