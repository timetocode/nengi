import type { AppliedEntityChange, ChannelFrame, ClosedChannel } from '../client/Frame'
import {
    EcsWorld,
    type ComponentTypeId,
    type IdentifiedComponent,
    type Nid,
    type Pid
} from './EcsWorld'

export type AppliedEcsComponentUpdate = {
    component: IdentifiedComponent
    nid: Nid
    prop: string
    previous: any
    value: any
}

export type AppliedEcsComponentDelete = {
    nid: Nid
    pid?: Pid
    ntype?: ComponentTypeId
    component?: IdentifiedComponent
}

export type AppliedEcsChannelFrame = {
    channelId: number
    createdEntities: Pid[]
    createdComponents: IdentifiedComponent[]
    updatedComponents: AppliedEcsComponentUpdate[]
    deletedComponents: AppliedEcsComponentDelete[]
    deletedEntities: Pid[]
}

export type ApplyEcsChannelFrameOptions = {
    isNetworkComponent?: (component: IdentifiedComponent) => boolean
}

function defaultIsNetworkComponent(component: IdentifiedComponent) {
    return component.ntype >= 0
}

export function applyEcsChannelFrame(
    world: EcsWorld,
    channel: ChannelFrame,
    options: ApplyEcsChannelFrameOptions = {}
): AppliedEcsChannelFrame {
    const isNetworkComponent = options.isNetworkComponent || defaultIsNetworkComponent
    const changes = createAppliedEcsChannelFrame(channel.channelId)

    for (let i = 0; i < channel.ecsCreateEntities.length; i++) {
        const pid = channel.ecsCreateEntities[i]
        world.createEntity(pid)
        changes.createdEntities.push(pid)
    }

    for (let i = 0; i < channel.ecsCreateComponents.length; i++) {
        const component = world.add({ ...channel.ecsCreateComponents[i] } as IdentifiedComponent)
        changes.createdComponents.push(component)
    }

    for (let i = 0; i < channel.updateEntities.length; i++) {
        changes.updatedComponents.push(applyComponentUpdate(world, channel.updateEntities[i]))
    }

    for (let i = 0; i < channel.deleteEntities.length; i++) {
        changes.deletedComponents.push(deleteComponentByNid(world, channel.deleteEntities[i]))
    }

    for (let i = 0; i < channel.ecsDeleteEntities.length; i++) {
        const pid = channel.ecsDeleteEntities[i]
        deleteRemainingNetworkComponents(world, pid, isNetworkComponent, changes.deletedComponents)
        if (world.componentNidsForEntity(pid).length === 0) {
            world.removeEntity(pid)
        }
        changes.deletedEntities.push(pid)
    }

    return changes
}

export function applyEcsChannelClose(
    world: EcsWorld,
    channel: ClosedChannel,
    options: ApplyEcsChannelFrameOptions = {}
): AppliedEcsChannelFrame {
    const isNetworkComponent = options.isNetworkComponent || defaultIsNetworkComponent
    const changes = createAppliedEcsChannelFrame(channel.channelId)
    const affectedPids = new Set<Pid>()

    for (let i = 0; i < channel.entityNids.length; i++) {
        const nid = channel.entityNids[i]
        const component = world.getByNid(nid)
        if (component && isNetworkComponent(component)) {
            affectedPids.add(component.pid)
            changes.deletedComponents.push(deleteComponentByNid(world, nid))
            continue
        }

        const deletedCount = changes.deletedComponents.length
        deleteRemainingNetworkComponents(world, nid, isNetworkComponent, changes.deletedComponents)
        if (changes.deletedComponents.length !== deletedCount || world.componentNidsForEntity(nid).length > 0) {
            affectedPids.add(nid)
        }
    }

    affectedPids.forEach(pid => {
        if (world.componentNidsForEntity(pid).length === 0) {
            world.removeEntity(pid)
        }
        changes.deletedEntities.push(pid)
    })

    return changes
}

function createAppliedEcsChannelFrame(channelId: number): AppliedEcsChannelFrame {
    return {
        channelId,
        createdEntities: [],
        createdComponents: [],
        updatedComponents: [],
        deletedComponents: [],
        deletedEntities: []
    }
}

function applyComponentUpdate(world: EcsWorld, update: AppliedEntityChange): AppliedEcsComponentUpdate {
    const component = world.getByNid(update.nid) as (IdentifiedComponent & Record<string, any>) | undefined
    if (!component) {
        throw new Error(`Cannot apply ECS update for missing component nid ${update.nid}.`)
    }

    const previous = component[update.prop]
    component[update.prop] = update.value
    return {
        component,
        nid: update.nid,
        prop: update.prop,
        previous,
        value: update.value
    }
}

function deleteComponentByNid(world: EcsWorld, nid: Nid): AppliedEcsComponentDelete {
    const component = world.getByNid(nid)
    const deleted: AppliedEcsComponentDelete = {
        nid,
        pid: component?.pid,
        ntype: component?.ntype,
        component
    }
    world.removeComponentByNid(nid)
    return deleted
}

function deleteRemainingNetworkComponents(
    world: EcsWorld,
    pid: Pid,
    isNetworkComponent: (component: IdentifiedComponent) => boolean,
    deletedComponents: AppliedEcsComponentDelete[]
) {
    const nids = world.componentNidsForEntity(pid)
    for (let i = 0; i < nids.length; i++) {
        const component = world.getByNid(nids[i])
        if (component && isNetworkComponent(component)) {
            deletedComponents.push(deleteComponentByNid(world, nids[i]))
        }
    }
}
