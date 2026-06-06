import { IEntity } from '../common/IEntity'
import { Channel, ChannelOptions } from './Channel'
import { LocalState, MutationMode } from './LocalState'

export type MutationChannelOptions = ChannelOptions & {
    mutationMode?: MutationMode
}

export class MutationChannel extends Channel {
    readonly mutationChannelMode = true
    readonly mutationMode: MutationMode
    dirtyNids: Set<number> = new Set()
    propMutations: Map<number, Set<string>> = new Map()
    groupMutations: Map<number, Set<string>> = new Map()

    constructor(localState: LocalState, options: MutationChannelOptions = {}) {
        super(localState, options)
        this.mutationMode = options.mutationMode || localState.mutationMode
    }

    markDirty(entity: IEntity) {
        if (entity.nid === 0 || !this.localState.sources.has(entity.nid)) {
            return false
        }

        if (!this.localState.dirtyNids.has(entity.nid)) {
            this.localState.dirtyNids.add(entity.nid)
            this.localState.mutationVersion++
        }
        this.dirtyNids.add(entity.nid)
        return true
    }

    private canRecordExplicitMutation(entity: IEntity) {
        return entity.nid !== 0 && this.localState.sources.has(entity.nid)
    }

    mutate<T extends IEntity, K extends keyof T & string>(entity: T, prop: K, value: T[K]) {
        entity[prop] = value
        this.markPropDirty(entity, prop)
        return value
    }

    mutateGroup<T extends IEntity>(entity: T, groupName: string, values: { [K in keyof T & string]?: T[K] }) {
        const target = entity as any
        for (const prop in values) {
            target[prop] = values[prop]
        }
        this.markGroupDirty(entity, groupName)
        return values
    }

    markPropDirty<T extends IEntity, K extends keyof T & string>(entity: T, prop: K) {
        if (this.mutationMode !== 'explicit') {
            this.markDirty(entity)
            return entity[prop]
        }
        if (!this.canRecordExplicitMutation(entity)) {
            return entity[prop]
        }
        let props = this.propMutations.get(entity.nid)
        if (!props) {
            props = new Set()
            this.propMutations.set(entity.nid, props)
        }
        props.add(prop)
        return entity[prop]
    }

    markGroupDirty(entity: IEntity, groupName: string) {
        if (this.mutationMode !== 'explicit') {
            return this.markDirty(entity)
        }
        if (!this.canRecordExplicitMutation(entity)) {
            return false
        }
        let groups = this.groupMutations.get(entity.nid)
        if (!groups) {
            groups = new Set()
            this.groupMutations.set(entity.nid, groups)
        }
        groups.add(groupName)
        return true
    }

    clearSnapshotDeltas() {
        super.clearSnapshotDeltas()
        this.dirtyNids.clear()
        this.propMutations.clear()
        this.groupMutations.clear()
    }
}
