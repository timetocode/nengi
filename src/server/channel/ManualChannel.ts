import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { ChannelType } from '../../common/ChannelHeader'
import { IEntity } from '../../common/IEntity'
import { Instance } from '../Instance'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { Channel, ChannelOptions } from './Channel'
import { createManualChannelOutput } from './ManualChannelOutput'
import { appendManualGroup, appendManualGroup1, appendManualGroup2, appendManualGroup3, appendManualGroup4, appendManualProp } from './EcsSpatialManualLog'

export type ManualPropWriter = (entity: IEntity, value: any) => void
export type ManualGroupWriter = (entity: IEntity, ...values: any[]) => void

export type ManualTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: ManualPropWriter }
    readonly groups: { [name: string]: ManualGroupWriter }
}

export type ManualChannelSnapshotVisibility = {
    toCreate: number[]
    toUpdate: number[]
    toDelete: number[]
    visibleRef: number[]
    visibleSet: Set<number>
}

type RememberedManualChannelVisibility = {
    visibleRef: number[]
    visibleSet: Set<number>
}

export class ManualChannel extends Channel {
    // Snapshot writers key off this marker to use the manual mutation log
    // instead of scanning visible entities and diffing every schema property.
    readonly manualUpdateChannelMode = true
    manualPropNids: number[] = []
    manualPropSchemas: SchemaProp[] = []
    manualPropValues: any[] = []
    manualGroupNids: number[] = []
    manualGroupSchemas: SchemaUpdateGroup[] = []
    manualGroupValueOffsets: number[] = []
    manualGroupValues: any[] = []
    manualOpTypes: number[] = []
    manualOpIndexes: number[] = []
    manualNeedsCoalesce = false
    private snapshotVisibilityByUser: Map<number, RememberedManualChannelVisibility> = new Map()

    constructor(localState: LocalState, options: ChannelOptions = {}) {
        super(localState, { ...options, channelType: ChannelType.ManualChannel })
    }

    createSnapshotOutput(user: User, instance: Instance, protocol: ProtocolConfig) {
        return createManualChannelOutput(user, instance, this, protocol)
    }

    collectSnapshotVisibility(userOrId: User | number): ManualChannelSnapshotVisibility {
        const userId = typeof userOrId === 'number' ? userOrId : userOrId.id
        const visibleRef = this.getVisibleNetworkedNids(userId)
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

    rememberSnapshotVisibility(userId: number, visibility: ManualChannelSnapshotVisibility) {
        this.snapshotVisibilityByUser.set(userId, {
            visibleRef: visibility.visibleRef,
            visibleSet: visibility.visibleSet
        })
    }

    unsubscribe(user: User) {
        this.snapshotVisibilityByUser.delete(user.id)
        super.unsubscribe(user)
    }

    createEntityWriter(ntype: number, schema: Schema): ManualTypeWriters {
        const props: { [name: string]: ManualPropWriter } = Object.create(null)
        const groups: { [name: string]: ManualGroupWriter } = Object.create(null)
        const writers: ManualTypeWriters = {
            ntype,
            schema,
            props,
            groups
        }
        const aliases = new Set<string>()
        const blockedAliases = new Set(['ntype', 'schema', 'props', 'groups'])
        const addAlias = (name: string, writer: ManualPropWriter | ManualGroupWriter) => {
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

        // Generated closures close over the channel arrays directly. This is
        // deliberately small and unsafe: validation belongs in separate debug
        // modes, while the default writer path should be just array appends.
        const propNames = Object.keys(schema.props)
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i]
            const prop = schema.props[name]
            props[name] = (entity: IEntity, value: any) => {
                appendManualProp(this, entity.nid, prop, value)
            }
            addAlias(name, props[name])
        }

        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            if (group.props.length === 1) {
                groups[group.name] = (entity: IEntity, v0: any) => {
                    appendManualGroup1(this, entity.nid, group, v0)
                }
            } else if (group.props.length === 2) {
                groups[group.name] = (entity: IEntity, v0: any, v1: any) => {
                    appendManualGroup2(this, entity.nid, group, v0, v1)
                }
            } else if (group.props.length === 3) {
                groups[group.name] = (entity: IEntity, v0: any, v1: any, v2: any) => {
                    appendManualGroup3(this, entity.nid, group, v0, v1, v2)
                }
            } else if (group.props.length === 4) {
                groups[group.name] = (entity: IEntity, v0: any, v1: any, v2: any, v3: any) => {
                    appendManualGroup4(this, entity.nid, group, v0, v1, v2, v3)
                }
            } else {
                groups[group.name] = (entity: IEntity, ...values: any[]) => {
                    appendManualGroup(this, entity.nid, group, values)
                }
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

    clearSnapshotDeltas() {
        super.clearSnapshotDeltas()
        this.manualPropNids.length = 0
        this.manualPropSchemas.length = 0
        this.manualPropValues.length = 0
        this.manualGroupNids.length = 0
        this.manualGroupSchemas.length = 0
        this.manualGroupValueOffsets.length = 0
        this.manualGroupValues.length = 0
        this.manualOpTypes.length = 0
        this.manualOpIndexes.length = 0
        this.manualNeedsCoalesce = false
    }

    destroy() {
        super.destroy()
        this.manualPropNids.length = 0
        this.manualPropSchemas.length = 0
        this.manualPropValues.length = 0
        this.manualGroupNids.length = 0
        this.manualGroupSchemas.length = 0
        this.manualGroupValueOffsets.length = 0
        this.manualGroupValues.length = 0
        this.manualOpTypes.length = 0
        this.manualOpIndexes.length = 0
        this.manualNeedsCoalesce = false
        this.snapshotVisibilityByUser.clear()
    }
}
