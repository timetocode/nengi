import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'
import { IEntity } from '../../common/IEntity'
import { LocalState } from '../LocalState'
import { Channel, ChannelOptions } from './Channel'

export type ManualPropWriter = (entity: IEntity, value: any) => void
export type ManualGroupWriter = (entity: IEntity, ...values: any[]) => void

export type ManualTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: ManualPropWriter }
    readonly groups: { [name: string]: ManualGroupWriter }
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

    constructor(localState: LocalState, options: ChannelOptions = {}) {
        super(localState, options)
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

        const propNids = this.manualPropNids
        const propSchemas = this.manualPropSchemas
        const propValues = this.manualPropValues
        // Generated closures close over the channel arrays directly. This is
        // deliberately small and unsafe: validation belongs in separate debug
        // modes, while the default writer path should be just array appends.
        const propNames = Object.keys(schema.props)
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i]
            const prop = schema.props[name]
            props[name] = function writeManualProp(entity: IEntity, value: any) {
                propNids.push(entity.nid)
                propSchemas.push(prop)
                propValues.push(value)
            }
            addAlias(name, props[name])
        }

        const groupNids = this.manualGroupNids
        const groupSchemas = this.manualGroupSchemas
        const groupValueOffsets = this.manualGroupValueOffsets
        const groupValues = this.manualGroupValues
        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            if (group.props.length === 1) {
                groups[group.name] = function writeManualGroup1(entity: IEntity, v0: any) {
                    groupNids.push(entity.nid)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0)
                }
            } else if (group.props.length === 2) {
                groups[group.name] = function writeManualGroup2(entity: IEntity, v0: any, v1: any) {
                    groupNids.push(entity.nid)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1)
                }
            } else if (group.props.length === 3) {
                groups[group.name] = function writeManualGroup3(entity: IEntity, v0: any, v1: any, v2: any) {
                    groupNids.push(entity.nid)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1, v2)
                }
            } else if (group.props.length === 4) {
                groups[group.name] = function writeManualGroup4(entity: IEntity, v0: any, v1: any, v2: any, v3: any) {
                    groupNids.push(entity.nid)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1, v2, v3)
                }
            } else {
                groups[group.name] = function writeManualGroup(entity: IEntity) {
                    groupNids.push(entity.nid)
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

    clearSnapshotDeltas() {
        super.clearSnapshotDeltas()
        this.manualPropNids.length = 0
        this.manualPropSchemas.length = 0
        this.manualPropValues.length = 0
        this.manualGroupNids.length = 0
        this.manualGroupSchemas.length = 0
        this.manualGroupValueOffsets.length = 0
        this.manualGroupValues.length = 0
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
    }
}
