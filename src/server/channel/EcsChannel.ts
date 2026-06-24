import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { ChannelHeader, ChannelHeaderInput, ChannelType, createChannelHeader, hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { IEntity } from '../../common/IEntity'
import { Instance } from '../Instance'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { createEcsChannelOutput } from './EcsChannelOutput'
import { IChannel } from './IChannel'
import {
    appendEcsSpatialManualProp,
    appendManualGroup,
    appendManualGroup1,
    appendManualGroup2,
    appendManualGroup3,
    appendManualGroup4
} from './EcsSpatialManualLog'

export type EcsComponent = IEntity & { pid: number }

export type EcsTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: (component: EcsComponent, value: any) => void }
    readonly groups: { [name: string]: (component: EcsComponent, ...values: any[]) => void }
}

export type EcsChannelOptions = {
    name?: string
    header?: ChannelHeaderInput
}

export type EcsChannelSnapshotVisibility = {
    toCreate: number[]
    toUpdate: number[]
    toDelete: number[]
    visibleRef: number[]
    visibleSet: Set<number>
}

type RememberedEcsChannelVisibility = {
    visibleRef: number[]
    visibleSet: Set<number>
}

/**
 * Full-visibility ECS channel with manual mutation emission. Userland must call
 * the component writers for networked updates; nengi does not autodiff component state.
 */
export class EcsChannel implements IChannel {
    readonly ecsChannelMode = true
    nid: number
    localState: LocalState
    users: Map<number, User> = new Map()
    header: ChannelHeader
    headerVersion = 0
    channelType = ChannelType.EcsChannel
    rootNids: number[] = []
    componentNids: number[] = []
    membershipVersion = 0
    createdRoots: number[] = []
    deletedEntities: number[] = []
    createdComponents: EcsComponent[] = []
    deletedComponents: number[] = []
    manualPropNids: number[] = []
    manualPropSchemas: SchemaProp[] = []
    manualPropValues: any[] = []
    manualGroupNids: number[] = []
    manualGroupNTypes: number[] = []
    manualGroupSchemas: SchemaUpdateGroup[] = []
    manualGroupValueOffsets: number[] = []
    manualGroupValues: any[] = []
    manualOpTypes: number[] = []
    manualOpIndexes: number[] = []
    manualNeedsCoalesce = false
    skipInterpolationNids: number[] = []
    broadcastMessages: any[] = []
    interpolatedBroadcastMessages: any[] = []
    private rootSet: Set<number> = new Set()
    private componentSet: Set<number> = new Set()
    private componentsByRoot: Map<number, EcsComponent[]> = new Map()
    private componentByNid: Map<number, EcsComponent> = new Map()
    private visibleNetworkedNidsCache: { membershipVersion: number, nids: number[] } | null = null
    private snapshotVisibilityByUser: Map<number, RememberedEcsChannelVisibility> = new Map()

    constructor(localState: LocalState, options: EcsChannelOptions = {}) {
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.header = createChannelHeader(this.nid, this.channelType, options.header, options.name)
        this.headerVersion = hasSchemaBackedChannelHeader(this.header) ? 1 : 0
        this.localState.channels.add(this)
    }

    createEntity() {
        // In the ECS model a root entity is only a network id. All replicated
        // data lives on components, which keeps root CRUD cheap and avoids
        // pretending there is a monolithic entity object to scan.
        const nid = this.localState.nextNetworkId()
        this.rootNids.push(nid)
        this.rootSet.add(nid)
        this.componentsByRoot.set(nid, [])
        this.createdRoots.push(nid)
        this.membershipVersion++
        this.visibleNetworkedNidsCache = null
        return nid
    }

    syncHeader() {
        if (!hasSchemaBackedChannelHeader(this.header)) {
            return false
        }
        this.headerVersion++
        return true
    }

    removeEntity(pidOrEntity: number | IEntity) {
        const pid = typeof pidOrEntity === 'number' ? pidOrEntity : pidOrEntity.nid
        if (!this.rootSet.has(pid)) {
            return 0
        }

        const components = this.componentsByRoot.get(pid) || []
        for (let i = components.length - 1; i >= 0; i--) {
            this.removeComponentInternal(components[i])
        }

        const createdIndex = this.createdRoots.indexOf(pid)
        if (createdIndex > -1) {
            this.createdRoots.splice(createdIndex, 1)
        } else {
            this.deletedEntities.push(pid)
        }
        this.rootSet.delete(pid)
        this.componentsByRoot.delete(pid)
        const rootIndex = this.rootNids.indexOf(pid)
        if (rootIndex > -1) {
            this.rootNids.splice(rootIndex, 1)
        }
        this.localState.nidPool.returnId(pid)
        this.membershipVersion++
        this.visibleNetworkedNidsCache = null
        return pid
    }

    removeAllEntities() {
        const roots = this.rootNids.slice()
        for (let i = 0; i < roots.length; i++) {
            this.removeEntity(roots[i])
        }
    }

    addComponent<T extends IEntity>(pid: number, component: T): T & EcsComponent {
        if (!this.rootSet.has(pid)) {
            throw new Error(`Cannot add an ECS component to unknown entity nid ${pid}.`)
        }
        const ecsComponent = component as T & EcsComponent
        const nid = this.localState.registerEntity(ecsComponent, pid)
        ecsComponent.pid = pid
        this.componentNids.push(nid)
        this.componentSet.add(nid)
        this.componentByNid.set(nid, ecsComponent)
        this.componentsByRoot.get(pid)!.push(ecsComponent)
        this.createdComponents.push(ecsComponent)
        this.membershipVersion++
        this.visibleNetworkedNidsCache = null
        return ecsComponent
    }

    private removeComponentInternal(componentOrNid: EcsComponent | number) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid
        const component = this.componentByNid.get(nid)
        if (!component) {
            return
        }
        const pid = component.pid
        const createdIndex = this.createdComponents.findIndex(created => created.nid === nid)
        if (createdIndex > -1) {
            this.createdComponents.splice(createdIndex, 1)
        } else {
            this.deletedComponents.push(nid)
        }
        this.componentSet.delete(nid)
        this.componentByNid.delete(nid)
        const componentIndex = this.componentNids.indexOf(nid)
        if (componentIndex > -1) {
            this.componentNids.splice(componentIndex, 1)
        }
        const components = this.componentsByRoot.get(pid)
        if (components) {
            const rootComponentIndex = components.findIndex(rootComponent => rootComponent.nid === nid)
            if (rootComponentIndex > -1) {
                components.splice(rootComponentIndex, 1)
            }
        }
        this.localState.unregisterEntity(component, pid)
        this.membershipVersion++
        this.visibleNetworkedNidsCache = null
    }

    removeComponent(componentOrNid: EcsComponent | number) {
        this.removeComponentInternal(componentOrNid)
    }

    isRootNid(nid: number) {
        return this.rootSet.has(nid) || this.deletedEntities.indexOf(nid) > -1
    }

    isComponentNid(nid: number) {
        return this.componentSet.has(nid) || this.deletedComponents.indexOf(nid) > -1
    }

    getComponent(nid: number) {
        return this.componentByNid.get(nid)
    }

    getVisibleEntities() {
        return this.rootNids
    }

    getVisibleNetworkedNids() {
        const cached = this.visibleNetworkedNidsCache
        if (cached && cached.membershipVersion === this.membershipVersion) {
            return cached.nids
        }

        const nids: number[] = []
        for (let i = 0; i < this.rootNids.length; i++) {
            const rootNid = this.rootNids[i]
            nids.push(rootNid)
            const components = this.componentsByRoot.get(rootNid)
            if (!components) {
                continue
            }
            for (let j = 0; j < components.length; j++) {
                nids.push(components[j].nid)
            }
        }
        this.visibleNetworkedNidsCache = { membershipVersion: this.membershipVersion, nids }
        return nids
    }

    collectSnapshotVisibility(userOrId: User | number): EcsChannelSnapshotVisibility {
        const userId = typeof userOrId === 'number' ? userOrId : userOrId.id
        const visibleRef = this.getVisibleNetworkedNids()
        const previous = this.snapshotVisibilityByUser.get(userId)
        if (previous && previous.visibleRef === visibleRef) {
            return {
                toCreate: [],
                toUpdate: visibleRef.slice(),
                toDelete: [],
                visibleRef,
                visibleSet: previous.visibleSet
            }
        }

        const visibleSet = new Set(visibleRef)
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []

        if (!previous) {
            toCreate.push(...visibleRef)
        } else {
            for (let i = 0; i < visibleRef.length; i++) {
                const nid = visibleRef[i]
                if (previous.visibleSet.has(nid)) {
                    toUpdate.push(nid)
                } else {
                    toCreate.push(nid)
                }
            }
            previous.visibleSet.forEach(nid => {
                if (!visibleSet.has(nid)) {
                    toDelete.push(nid)
                }
            })
        }

        return { toCreate, toUpdate, toDelete, visibleRef, visibleSet }
    }

    rememberSnapshotVisibility(userId: number, visibility: EcsChannelSnapshotVisibility) {
        this.snapshotVisibilityByUser.set(userId, {
            visibleRef: visibility.visibleRef,
            visibleSet: visibility.visibleSet
        })
    }

    createSnapshotOutput(user: User, instance: Instance, protocol: ProtocolConfig) {
        return createEcsChannelOutput(user, instance, this, protocol)
    }

    subscribe(user: User) {
        this.users.set(user.id, user)
        user.subscribe(this)
    }

    unsubscribe(user: User) {
        this.users.delete(user.id)
        this.snapshotVisibilityByUser.delete(user.id)
        user.unsubscribe(this)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    destroy() {
        this.unsubscribeAll()
        this.removeAllEntities()
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this)
        this.rootNids.length = 0
        this.componentNids.length = 0
        this.createdRoots.length = 0
        this.deletedEntities.length = 0
        this.createdComponents.length = 0
        this.deletedComponents.length = 0
        this.manualPropNids.length = 0
        this.manualPropSchemas.length = 0
        this.manualPropValues.length = 0
        this.manualGroupNids.length = 0
        this.manualGroupNTypes.length = 0
        this.manualGroupSchemas.length = 0
        this.manualGroupValueOffsets.length = 0
        this.manualGroupValues.length = 0
        this.manualOpTypes.length = 0
        this.manualOpIndexes.length = 0
        this.manualNeedsCoalesce = false
        this.skipInterpolationNids.length = 0
        this.broadcastMessages.length = 0
        this.interpolatedBroadcastMessages.length = 0
        this.rootSet.clear()
        this.componentSet.clear()
        this.componentsByRoot.clear()
        this.componentByNid.clear()
        this.snapshotVisibilityByUser.clear()
        this.visibleNetworkedNidsCache = null
    }

    addMessage(message: any) {
        this.broadcastMessages.push(message)
    }

    addInterpolatedMessage(message: any) {
        this.interpolatedBroadcastMessages.push(message)
    }

    // ECS roots are ids only; skip interpolation is meaningful for stateful
    // components that the client interpolates, such as transform components.
    skipInterpolation(pidOrComponent: number | IEntity) {
        const nid = typeof pidOrComponent === 'number' ? pidOrComponent : pidOrComponent.nid
        if (!this.componentSet.has(nid)) {
            return false
        }
        this.skipInterpolationNids.push(nid)
        return true
    }

    clearBroadcastMessages() {
        this.broadcastMessages.length = 0
        this.interpolatedBroadcastMessages.length = 0
    }

    hasStructuralDeltas() {
        return this.createdRoots.length > 0 ||
            this.deletedEntities.length > 0 ||
            this.createdComponents.length > 0 ||
            this.deletedComponents.length > 0
    }

    clearSnapshotDeltas() {
        this.createdRoots.length = 0
        this.deletedEntities.length = 0
        this.createdComponents.length = 0
        this.deletedComponents.length = 0
        this.manualPropNids.length = 0
        this.manualPropSchemas.length = 0
        this.manualPropValues.length = 0
        this.manualGroupNids.length = 0
        this.manualGroupNTypes.length = 0
        this.manualGroupSchemas.length = 0
        this.manualGroupValueOffsets.length = 0
        this.manualGroupValues.length = 0
        this.manualOpTypes.length = 0
        this.manualOpIndexes.length = 0
        this.manualNeedsCoalesce = false
        this.skipInterpolationNids.length = 0
    }

    createComponentWriter(ntype: number, schema: Schema): EcsTypeWriters {
        const props: EcsTypeWriters['props'] = Object.create(null)
        const groups: EcsTypeWriters['groups'] = Object.create(null)
        const writers: EcsTypeWriters = { ntype, schema, props, groups }

        const aliases = new Set<string>()
        const blockedAliases = new Set(['ntype', 'schema', 'props', 'groups'])
        const addAlias = (name: string, writer: any) => {
            if (blockedAliases.has(name)) {
                return
            }
            if (aliases.has(name)) {
                delete writers[name]
                blockedAliases.add(name)
                return
            }
            aliases.add(name)
            writers[name] = writer
        }

        const propNames = Object.keys(schema.props)
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i]
            const prop = schema.props[name]
            props[name] = (component: EcsComponent, value: any) => {
                appendEcsSpatialManualProp(this, component.nid, prop, value)
            }
            addAlias(name, props[name])
        }

        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            if (group.props.length === 1) {
                groups[group.name] = (component: EcsComponent, v0: any) => {
                    appendManualGroup1(this, component.nid, group, v0, ntype)
                }
            } else if (group.props.length === 2) {
                groups[group.name] = (component: EcsComponent, v0: any, v1: any) => {
                    appendManualGroup2(this, component.nid, group, v0, v1, ntype)
                }
            } else if (group.props.length === 3) {
                groups[group.name] = (component: EcsComponent, v0: any, v1: any, v2: any) => {
                    appendManualGroup3(this, component.nid, group, v0, v1, v2, ntype)
                }
            } else if (group.props.length === 4) {
                groups[group.name] = (component: EcsComponent, v0: any, v1: any, v2: any, v3: any) => {
                    appendManualGroup4(this, component.nid, group, v0, v1, v2, v3, ntype)
                }
            } else {
                groups[group.name] = (component: EcsComponent, ...values: any[]) => {
                    appendManualGroup(this, component.nid, group, values, 0, ntype)
                }
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

}
