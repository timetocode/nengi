import { Schema, SchemaProp, SchemaUpdateGroup } from '../common/binary/schema/Schema'
import { IEntity } from '../common/IEntity'
import { IChannel } from './IChannel'
import { LocalState } from './LocalState'
import { User } from './User'

export type EcsComponent = IEntity & { pid: number }

export type EcsTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: (component: EcsComponent, value: any) => void }
    readonly groups: { [name: string]: (component: EcsComponent, ...values: any[]) => void }
}

export type EcsChannelOptions = {
    label?: string
    clientIdentity?: any
}

export class EcsChannel implements IChannel {
    readonly ecsChannelMode = true
    nid: number
    label?: string
    clientIdentity?: any
    localState: LocalState
    users: Map<number, User> = new Map()
    rootNids: number[] = []
    componentNids: number[] = []
    membershipVersion = 0
    createdRoots: number[] = []
    deletedRoots: number[] = []
    createdComponents: EcsComponent[] = []
    deletedComponents: number[] = []
    rootDeletedComponents: number[] = []
    manualPropNids: number[] = []
    manualPropSchemas: SchemaProp[] = []
    manualPropValues: any[] = []
    manualGroupNids: number[] = []
    manualGroupNTypes: number[] = []
    manualGroupSchemas: SchemaUpdateGroup[] = []
    manualGroupValueOffsets: number[] = []
    manualGroupValues: any[] = []
    broadcastMessages: any[] = []
    private rootSet: Set<number> = new Set()
    private componentSet: Set<number> = new Set()
    private componentsByRoot: Map<number, EcsComponent[]> = new Map()
    private componentByNid: Map<number, EcsComponent> = new Map()
    private visibleNetworkedNidsCache: { membershipVersion: number, nids: number[] } | null = null

    constructor(localState: LocalState, options: EcsChannelOptions = {}) {
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.label = options.label
        this.clientIdentity = options.clientIdentity
        this.localState.channels.add(this)
    }

    tick(tick: number) {
    }

    createEntity() {
        const nid = this.localState.nextNetworkId()
        this.rootNids.push(nid)
        this.rootSet.add(nid)
        this.componentsByRoot.set(nid, [])
        this.createdRoots.push(nid)
        this.membershipVersion++
        this.visibleNetworkedNidsCache = null
        return nid
    }

    addEntity() {
        return this.createEntity()
    }

    removeEntity(pidOrEntity: number | IEntity) {
        const pid = typeof pidOrEntity === 'number' ? pidOrEntity : pidOrEntity.nid
        if (!this.rootSet.has(pid)) {
            return
        }

        const components = this.componentsByRoot.get(pid) || []
        for (let i = components.length - 1; i >= 0; i--) {
            this.removeComponentInternal(components[i], false)
        }

        const createdIndex = this.createdRoots.indexOf(pid)
        if (createdIndex > -1) {
            this.createdRoots.splice(createdIndex, 1)
        } else {
            this.deletedRoots.push(pid)
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

    private removeComponentInternal(componentOrNid: EcsComponent | number, queueDelete: boolean) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid
        const component = this.componentByNid.get(nid)
        if (!component) {
            return
        }
        const pid = component.pid
        const createdIndex = this.createdComponents.findIndex(created => created.nid === nid)
        if (createdIndex > -1) {
            this.createdComponents.splice(createdIndex, 1)
        } else if (queueDelete) {
            this.deletedComponents.push(nid)
        } else {
            this.rootDeletedComponents.push(nid)
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
        this.removeComponentInternal(componentOrNid, true)
    }

    isRootNid(nid: number) {
        return this.rootSet.has(nid) || this.deletedRoots.indexOf(nid) > -1
    }

    isComponentNid(nid: number) {
        return this.componentSet.has(nid) || this.deletedComponents.indexOf(nid) > -1
    }

    isRootDeletedComponentNid(nid: number) {
        return this.rootDeletedComponents.indexOf(nid) > -1
    }

    getComponent(nid: number) {
        return this.componentByNid.get(nid)
    }

    getVisibleEntities(userId: number) {
        return this.rootNids
    }

    getVisibleNetworkedNids(userId: number) {
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

    subscribe(user: User) {
        this.users.set(user.id, user)
        user.subscribe(this)
    }

    unsubscribe(user: User) {
        this.users.delete(user.id)
        user.unsubscribe(this)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    addMessage(message: any) {
        this.broadcastMessages.push(message)
    }

    clearBroadcastMessages() {
        this.broadcastMessages.length = 0
    }

    hasStructuralDeltas() {
        return this.createdRoots.length > 0 ||
            this.deletedRoots.length > 0 ||
            this.createdComponents.length > 0 ||
            this.deletedComponents.length > 0
    }

    clearSnapshotDeltas() {
        this.createdRoots.length = 0
        this.deletedRoots.length = 0
        this.createdComponents.length = 0
        this.deletedComponents.length = 0
        this.rootDeletedComponents.length = 0
        this.manualPropNids.length = 0
        this.manualPropSchemas.length = 0
        this.manualPropValues.length = 0
        this.manualGroupNids.length = 0
        this.manualGroupNTypes.length = 0
        this.manualGroupSchemas.length = 0
        this.manualGroupValueOffsets.length = 0
        this.manualGroupValues.length = 0
    }

    createComponentWriter(ntype: number, schema: Schema): EcsTypeWriters {
        const props: EcsTypeWriters['props'] = Object.create(null)
        const groups: EcsTypeWriters['groups'] = Object.create(null)
        const writers: EcsTypeWriters = { ntype, schema, props, groups }

        const addAlias = (name: string, writer: any) => {
            if (name === 'ntype' || name === 'schema' || name === 'props' || name === 'groups') {
                return
            }
            writers[name] = writer
        }

        const propNids = this.manualPropNids
        const propSchemas = this.manualPropSchemas
        const propValues = this.manualPropValues
        const propNames = Object.keys(schema.props)
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i]
            const prop = schema.props[name]
            props[name] = function writeEcsProp(component: EcsComponent, value: any) {
                propNids.push(component.nid)
                propSchemas.push(prop)
                propValues.push(value)
            }
            addAlias(name, props[name])
        }

        const groupNids = this.manualGroupNids
        const groupNTypes = this.manualGroupNTypes
        const groupSchemas = this.manualGroupSchemas
        const groupValueOffsets = this.manualGroupValueOffsets
        const groupValues = this.manualGroupValues
        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            if (group.props.length === 1) {
                groups[group.name] = function writeEcsGroup1(component: EcsComponent, v0: any) {
                    groupNids.push(component.nid)
                    groupNTypes.push(ntype)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0)
                }
            } else if (group.props.length === 2) {
                groups[group.name] = function writeEcsGroup2(component: EcsComponent, v0: any, v1: any) {
                    groupNids.push(component.nid)
                    groupNTypes.push(ntype)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1)
                }
            } else if (group.props.length === 3) {
                groups[group.name] = function writeEcsGroup3(component: EcsComponent, v0: any, v1: any, v2: any) {
                    groupNids.push(component.nid)
                    groupNTypes.push(ntype)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1, v2)
                }
            } else if (group.props.length === 4) {
                groups[group.name] = function writeEcsGroup4(component: EcsComponent, v0: any, v1: any, v2: any, v3: any) {
                    groupNids.push(component.nid)
                    groupNTypes.push(ntype)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1, v2, v3)
                }
            } else {
                groups[group.name] = function writeEcsGroup(component: EcsComponent) {
                    groupNids.push(component.nid)
                    groupNTypes.push(ntype)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    for (let j = 0; j < group.props.length; j++) {
                        groupValues.push(arguments[j + 1])
                    }
                }
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

    type(ntype: number, schema: Schema): EcsTypeWriters {
        return this.createComponentWriter(ntype, schema)
    }
}
