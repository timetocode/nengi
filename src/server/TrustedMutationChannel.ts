import { Schema, SchemaProp, SchemaUpdateGroup } from '../common/binary/schema/Schema'
import { IEntity } from '../common/IEntity'
import { Channel, ChannelOptions } from './Channel'
import { LocalState } from './LocalState'

export type TrustedPropWriter = (entity: IEntity, value: any) => void
export type TrustedGroupWriter = (entity: IEntity, ...values: any[]) => void

export type TrustedTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: TrustedPropWriter }
    readonly groups: { [name: string]: TrustedGroupWriter }
}

export class TrustedPropHandle {
    readonly channel: TrustedMutationChannel
    readonly prop: SchemaProp

    constructor(channel: TrustedMutationChannel, prop: SchemaProp) {
        this.channel = channel
        this.prop = prop
    }

    emit(entity: IEntity, value: any) {
        this.channel.emitProp(entity, this, value)
    }
}

export class TrustedGroupHandle {
    readonly channel: TrustedMutationChannel
    readonly group: SchemaUpdateGroup
    readonly arity: number

    constructor(channel: TrustedMutationChannel, group: SchemaUpdateGroup) {
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

export class TrustedSchemaHandles {
    readonly channel: TrustedMutationChannel
    readonly ntype: number
    readonly schema: Schema

    constructor(channel: TrustedMutationChannel, ntype: number, schema: Schema) {
        this.channel = channel
        this.ntype = ntype
        this.schema = schema
    }

    prop(name: string) {
        const prop = this.schema.props[name]
        if (!prop) {
            throw new Error(`TrustedMutationChannel prop "${name}" is not in schema for ntype ${this.ntype}.`)
        }
        return new TrustedPropHandle(this.channel, prop)
    }

    group(name: string) {
        for (let i = 0; i < this.schema.updateGroups.length; i++) {
            const group = this.schema.updateGroups[i]
            if (group.name === name) {
                return new TrustedGroupHandle(this.channel, group)
            }
        }
        throw new Error(`TrustedMutationChannel group "${name}" is not in schema for ntype ${this.ntype}.`)
    }
}

export class TrustedMutationChannel extends Channel {
    readonly trustedMutationChannelMode = true
    trustedPropNids: number[] = []
    trustedPropSchemas: SchemaProp[] = []
    trustedPropValues: any[] = []
    trustedGroupNids: number[] = []
    trustedGroupSchemas: SchemaUpdateGroup[] = []
    trustedGroupValueOffsets: number[] = []
    trustedGroupValues: any[] = []

    constructor(localState: LocalState, options: ChannelOptions = {}) {
        super(localState, options)
    }

    trusted(ntype: number, schema: Schema) {
        return new TrustedSchemaHandles(this, ntype, schema)
    }

    createEntityWriter(ntype: number, schema: Schema): TrustedTypeWriters {
        const props: { [name: string]: TrustedPropWriter } = Object.create(null)
        const groups: { [name: string]: TrustedGroupWriter } = Object.create(null)
        const writers: TrustedTypeWriters = {
            ntype,
            schema,
            props,
            groups
        }
        const aliases = new Set<string>()
        const blockedAliases = new Set(['ntype', 'schema', 'props', 'groups'])
        const addAlias = (name: string, writer: TrustedPropWriter | TrustedGroupWriter) => {
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

        const propNids = this.trustedPropNids
        const propSchemas = this.trustedPropSchemas
        const propValues = this.trustedPropValues
        const propNames = Object.keys(schema.props)
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i]
            const prop = schema.props[name]
            props[name] = function writeTrustedProp(entity: IEntity, value: any) {
                propNids.push(entity.nid)
                propSchemas.push(prop)
                propValues.push(value)
            }
            addAlias(name, props[name])
        }

        const groupNids = this.trustedGroupNids
        const groupSchemas = this.trustedGroupSchemas
        const groupValueOffsets = this.trustedGroupValueOffsets
        const groupValues = this.trustedGroupValues
        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            if (group.props.length === 1) {
                groups[group.name] = function writeTrustedGroup1(entity: IEntity, v0: any) {
                    groupNids.push(entity.nid)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0)
                }
            } else if (group.props.length === 2) {
                groups[group.name] = function writeTrustedGroup2(entity: IEntity, v0: any, v1: any) {
                    groupNids.push(entity.nid)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1)
                }
            } else if (group.props.length === 3) {
                groups[group.name] = function writeTrustedGroup3(entity: IEntity, v0: any, v1: any, v2: any) {
                    groupNids.push(entity.nid)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1, v2)
                }
            } else if (group.props.length === 4) {
                groups[group.name] = function writeTrustedGroup4(entity: IEntity, v0: any, v1: any, v2: any, v3: any) {
                    groupNids.push(entity.nid)
                    groupSchemas.push(group)
                    groupValueOffsets.push(groupValues.length)
                    groupValues.push(v0, v1, v2, v3)
                }
            } else {
                groups[group.name] = function writeTrustedGroup(entity: IEntity) {
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

    type(ntype: number, schema: Schema): TrustedTypeWriters {
        return this.createEntityWriter(ntype, schema)
    }

    emitProp(entity: IEntity, handle: TrustedPropHandle, value: any) {
        this.trustedPropNids.push(entity.nid)
        this.trustedPropSchemas.push(handle.prop)
        this.trustedPropValues.push(value)
    }

    emitGroup1(entity: IEntity, handle: TrustedGroupHandle, v0: any) {
        this.trustedGroupNids.push(entity.nid)
        this.trustedGroupSchemas.push(handle.group)
        this.trustedGroupValueOffsets.push(this.trustedGroupValues.length)
        this.trustedGroupValues.push(v0)
    }

    emitGroup2(entity: IEntity, handle: TrustedGroupHandle, v0: any, v1: any) {
        this.trustedGroupNids.push(entity.nid)
        this.trustedGroupSchemas.push(handle.group)
        this.trustedGroupValueOffsets.push(this.trustedGroupValues.length)
        this.trustedGroupValues.push(v0, v1)
    }

    emitGroup3(entity: IEntity, handle: TrustedGroupHandle, v0: any, v1: any, v2: any) {
        this.trustedGroupNids.push(entity.nid)
        this.trustedGroupSchemas.push(handle.group)
        this.trustedGroupValueOffsets.push(this.trustedGroupValues.length)
        this.trustedGroupValues.push(v0, v1, v2)
    }

    /**
     * Unsafe hot path for four-value update groups. The caller must pass a group
     * whose schema has exactly four props and values matching those binary types.
     */
    emitGroup4(entity: IEntity, handle: TrustedGroupHandle, v0: any, v1: any, v2: any, v3: any) {
        this.trustedGroupNids.push(entity.nid)
        this.trustedGroupSchemas.push(handle.group)
        this.trustedGroupValueOffsets.push(this.trustedGroupValues.length)
        this.trustedGroupValues.push(v0, v1, v2, v3)
    }

    /**
     * Unsafe generic path. This is convenient for experiments, but callers that
     * allocate `values` per entity will give back much of the intended win.
     */
    emitGroupValues(entity: IEntity, handle: TrustedGroupHandle, values: any[]) {
        this.trustedGroupNids.push(entity.nid)
        this.trustedGroupSchemas.push(handle.group)
        this.trustedGroupValueOffsets.push(this.trustedGroupValues.length)
        for (let i = 0; i < handle.group.props.length; i++) {
            this.trustedGroupValues.push(values[i])
        }
    }

    clearSnapshotDeltas() {
        super.clearSnapshotDeltas()
        this.trustedPropNids.length = 0
        this.trustedPropSchemas.length = 0
        this.trustedPropValues.length = 0
        this.trustedGroupNids.length = 0
        this.trustedGroupSchemas.length = 0
        this.trustedGroupValueOffsets.length = 0
        this.trustedGroupValues.length = 0
    }
}
