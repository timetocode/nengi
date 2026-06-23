import { IEntity } from '../../common/IEntity'
import { LocalState } from '../LocalState'

export type EcsSpatialComponent = IEntity & { pid: number }

export type RemovedEcsSpatialComponent<T extends EcsSpatialComponent> = {
    component: T
    pid: number
    wasSpatial: boolean
}

export class EcsSpatialEntityStore<T extends EcsSpatialComponent> {
    rootNids: number[] = []
    componentNids: number[] = []
    createdRoots: number[] = []
    deletedEntities: number[] = []
    createdComponents: T[] = []
    deletedComponents: number[] = []

    private rootSet: Set<number> = new Set()
    private componentSet: Set<number> = new Set()
    private componentsByRoot: Map<number, T[]> = new Map()
    private componentByNid: Map<number, T> = new Map()
    private spatialComponentByRoot: Map<number, T> = new Map()

    constructor(private localState: LocalState) {
    }

    createEntity() {
        const nid = this.localState.nextNetworkId()
        this.rootNids.push(nid)
        this.rootSet.add(nid)
        this.componentsByRoot.set(nid, [])
        this.createdRoots.push(nid)
        return nid
    }

    hasRoot(pid: number) {
        return this.rootSet.has(pid)
    }

    getComponents(pid: number) {
        return this.componentsByRoot.get(pid) || []
    }

    removeEntityRecord(pid: number) {
        if (!this.rootSet.has(pid)) {
            return false
        }

        const createdIndex = this.createdRoots.indexOf(pid)
        if (createdIndex > -1) {
            this.createdRoots.splice(createdIndex, 1)
        } else {
            this.deletedEntities.push(pid)
        }
        this.rootSet.delete(pid)
        this.componentsByRoot.delete(pid)
        this.spatialComponentByRoot.delete(pid)
        const rootIndex = this.rootNids.indexOf(pid)
        if (rootIndex > -1) {
            this.rootNids.splice(rootIndex, 1)
        }
        this.localState.nidPool.returnId(pid)
        return true
    }

    addComponent<U extends IEntity>(pid: number, component: U): U & T {
        if (!this.rootSet.has(pid)) {
            throw new Error(`Cannot add an ECS spatial component to unknown entity nid ${pid}.`)
        }
        const ecsComponent = component as U & T
        const nid = this.localState.registerEntity(ecsComponent, pid)
        ecsComponent.pid = pid
        this.componentNids.push(nid)
        this.componentSet.add(nid)
        this.componentByNid.set(nid, ecsComponent)
        this.componentsByRoot.get(pid)!.push(ecsComponent)
        this.createdComponents.push(ecsComponent)
        return ecsComponent
    }

    removeComponent(componentOrNid: T | number): RemovedEcsSpatialComponent<T> | null {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid
        const component = this.componentByNid.get(nid)
        if (!component) {
            return null
        }
        const pid = component.pid
        const createdIndex = this.createdComponents.findIndex(created => created.nid === nid)
        if (createdIndex > -1) {
            this.createdComponents.splice(createdIndex, 1)
        } else {
            this.deletedComponents.push(nid)
        }
        const wasSpatial = this.spatialComponentByRoot.get(pid)?.nid === nid
        if (wasSpatial) {
            this.spatialComponentByRoot.delete(pid)
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
        return { component, pid, wasSpatial }
    }

    setSpatialComponent(pid: number, componentOrNid: T | number) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid
        const component = this.componentByNid.get(nid)
        if (!component || component.pid !== pid) {
            throw new Error(`Cannot use component nid ${nid} as spatial component for ECS entity nid ${pid}.`)
        }
        this.spatialComponentByRoot.set(pid, component)
        return component
    }

    getSpatialComponent(pid: number) {
        return this.spatialComponentByRoot.get(pid)
    }

    isRootNid(nid: number) {
        return this.rootSet.has(nid) || this.deletedEntities.indexOf(nid) > -1
    }

    isComponentNid(nid: number) {
        return this.componentSet.has(nid) || this.deletedComponents.indexOf(nid) > -1
    }

    hasComponent(nid: number) {
        return this.componentSet.has(nid)
    }

    getComponent(nid: number) {
        return this.componentByNid.get(nid)
    }

    appendRootNetworkedNids(pid: number, nids: number[]) {
        nids.push(pid)
        const components = this.componentsByRoot.get(pid)
        if (!components) {
            return
        }
        for (let i = 0; i < components.length; i++) {
            nids.push(components[i].nid)
        }
    }

    clearSnapshotDeltas() {
        this.createdRoots.length = 0
        this.deletedEntities.length = 0
        this.createdComponents.length = 0
        this.deletedComponents.length = 0
    }

    clear() {
        this.rootNids.length = 0
        this.componentNids.length = 0
        this.createdRoots.length = 0
        this.deletedEntities.length = 0
        this.createdComponents.length = 0
        this.deletedComponents.length = 0
        this.rootSet.clear()
        this.componentSet.clear()
        this.componentsByRoot.clear()
        this.componentByNid.clear()
        this.spatialComponentByRoot.clear()
    }
}
