import type { AppliedEntityChange, ChannelFrame, ClosedChannel } from '../client/Frame'
import {
    EcsWorld,
    type Component,
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
    removedEntities: Pid[]
    removedLocalComponents: Component[]
}

export type ApplyEcsChannelFrameOptions = {
    isNetworkComponent?: (component: IdentifiedComponent) => boolean
    beforeRemoveEntity?: (pid: Pid, components: Component[]) => void
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

    // An existing component may be replaced with a new nid of the same type
    // in this frame. Release its world slot before adding the replacement.
    for (let i = 0; i < channel.deleteEntities.length; i++) {
        changes.deletedComponents.push(deleteComponentByNid(world, channel.deleteEntities[i]))
    }

    for (let i = 0; i < channel.ecsCreateComponents.length; i++) {
        const component = world.add({ ...channel.ecsCreateComponents[i] } as IdentifiedComponent)
        changes.createdComponents.push(component)
    }

    for (let i = 0; i < channel.updateEntities.length; i++) {
        changes.updatedComponents.push(applyComponentUpdate(world, channel.updateEntities[i]))
    }

    for (let i = 0; i < channel.ecsDeleteEntities.length; i++) {
        const pid = channel.ecsDeleteEntities[i]
        changes.deletedEntities.push(pid)
        removeEcsRootEntity(world, pid, isNetworkComponent, changes, options)
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
            continue
        }

        if (world.hasEntity(nid) || world.componentNidsForEntity(nid).length > 0) {
            affectedPids.add(nid)
        }
    }

    affectedPids.forEach(pid => {
        changes.deletedEntities.push(pid)
        removeEcsRootEntity(world, pid, isNetworkComponent, changes, options)
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
        deletedEntities: [],
        removedEntities: [],
        removedLocalComponents: []
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

function removeEcsRootEntity(
    world: EcsWorld,
    pid: Pid,
    isNetworkComponent: (component: IdentifiedComponent) => boolean,
    changes: AppliedEcsChannelFrame,
    options: ApplyEcsChannelFrameOptions
) {
    if (!world.hasEntity(pid)) {
        return
    }

    const components = world.componentsForEntity(pid)
    options.beforeRemoveEntity?.(pid, components.slice())
    const removed = world.removeEntity(pid)

    changes.removedEntities.push(pid)

    for (let i = 0; i < removed.length; i++) {
        const component = removed[i]
        if (component.nid !== undefined && isNetworkComponent(component as IdentifiedComponent)) {
            changes.deletedComponents.push({
                nid: component.nid,
                pid: component.pid,
                ntype: component.ntype,
                component: component as IdentifiedComponent
            })
        } else {
            changes.removedLocalComponents.push(component)
        }
    }
}
