import { Schema, SchemaProp, SchemaUpdateGroup } from '../common/binary/schema/Schema'
import { IEntity } from '../common/IEntity'
import { Channel, ChannelOptions } from './Channel'
import { LocalState } from './LocalState'

export type ManualPropWriter = (entity: IEntity, value: any) => void
export type ManualGroupWriter = (entity: IEntity, ...values: any[]) => void

export type ManualTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: ManualPropWriter }
    readonly groups: { [name: string]: ManualGroupWriter }
}

export class ManualPropHandle {
    readonly channel: ManualChannel
    readonly prop: SchemaProp

    constructor(channel: ManualChannel, prop: SchemaProp) {
        this.channel = channel
        this.prop = prop
    }

    emit(entity: IEntity, value: any) {
        this.channel.emitProp(entity, this, value)
    }
}

export class ManualGroupHandle {
    readonly channel: ManualChannel
    readonly group: SchemaUpdateGroup
    readonly arity: number

    constructor(channel: ManualChannel, group: SchemaUpdateGroup) {
        this.channel = channel
        this.group = group
        this.arity = group.props.length
    }

    emit1(entity: IEntity, v0: any) {
        this.channel.emitGroup1(entity, this, v0)
    }

    emit2(entity: IEntity, v0: any, v1: any) {
        this.channel.emitGroup2(entity, this, v0, v1)
    }

    emit3(entity: IEntity, v0: any, v1: any, v2: any) {
        this.channel.emitGroup3(entity, this, v0, v1, v2)
    }

    emit4(entity: IEntity, v0: any, v1: any, v2: any, v3: any) {
        this.channel.emitGroup4(entity, this, v0, v1, v2, v3)
    }

    emitValues(entity: IEntity, values: any[]) {
        this.channel.emitGroupValues(entity, this, values)
    }
}

export class ManualSchemaHandles {
    readonly channel: ManualChannel
    readonly ntype: number
    readonly schema: Schema

    constructor(channel: ManualChannel, ntype: number, schema: Schema) {
        this.channel = channel
        this.ntype = ntype
        this.schema = schema
    }

    prop(name: string) {
        const prop = this.schema.props[name]
        if (!prop) {
            throw new Error(`ManualChannel prop "${name}" is not in schema for ntype ${this.ntype}.`)
        }
        return new ManualPropHandle(this.channel, prop)
    }

    group(name: string) {
        for (let i = 0; i < this.schema.updateGroups.length; i++) {
            const group = this.schema.updateGroups[i]
            if (group.name === name) {
                return new ManualGroupHandle(this.channel, group)
            }
        }
        throw new Error(`ManualChannel group "${name}" is not in schema for ntype ${this.ntype}.`)
    }
}

export class ManualChannel extends Channel {
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

    manual(ntype: number, schema: Schema) {
        return new ManualSchemaHandles(this, ntype, schema)
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

    type(ntype: number, schema: Schema): ManualTypeWriters {
        return this.createEntityWriter(ntype, schema)
    }

    emitProp(entity: IEntity, handle: ManualPropHandle, value: any) {
        this.manualPropNids.push(entity.nid)
        this.manualPropSchemas.push(handle.prop)
        this.manualPropValues.push(value)
    }

    emitGroup1(entity: IEntity, handle: ManualGroupHandle, v0: any) {
        this.manualGroupNids.push(entity.nid)
        this.manualGroupSchemas.push(handle.group)
        this.manualGroupValueOffsets.push(this.manualGroupValues.length)
        this.manualGroupValues.push(v0)
    }

    emitGroup2(entity: IEntity, handle: ManualGroupHandle, v0: any, v1: any) {
        this.manualGroupNids.push(entity.nid)
        this.manualGroupSchemas.push(handle.group)
        this.manualGroupValueOffsets.push(this.manualGroupValues.length)
        this.manualGroupValues.push(v0, v1)
    }

    emitGroup3(entity: IEntity, handle: ManualGroupHandle, v0: any, v1: any, v2: any) {
        this.manualGroupNids.push(entity.nid)
        this.manualGroupSchemas.push(handle.group)
        this.manualGroupValueOffsets.push(this.manualGroupValues.length)
        this.manualGroupValues.push(v0, v1, v2)
    }

    /**
     * Unsafe hot path for four-value update groups. The caller must pass a group
     * whose schema has exactly four props and values matching those binary types.
     */
    emitGroup4(entity: IEntity, handle: ManualGroupHandle, v0: any, v1: any, v2: any, v3: any) {
        this.manualGroupNids.push(entity.nid)
        this.manualGroupSchemas.push(handle.group)
        this.manualGroupValueOffsets.push(this.manualGroupValues.length)
        this.manualGroupValues.push(v0, v1, v2, v3)
    }

    /**
     * Unsafe generic path. This is convenient for experiments, but callers that
     * allocate `values` per entity will give back much of the intended win.
     */
    emitGroupValues(entity: IEntity, handle: ManualGroupHandle, values: any[]) {
        this.manualGroupNids.push(entity.nid)
        this.manualGroupSchemas.push(handle.group)
        this.manualGroupValueOffsets.push(this.manualGroupValues.length)
        for (let i = 0; i < handle.group.props.length; i++) {
            this.manualGroupValues.push(values[i])
        }
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
}
