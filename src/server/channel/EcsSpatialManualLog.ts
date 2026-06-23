import { SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'

export type CoalescingManualUpdateLog = {
    manualPropNids: number[]
    manualPropSchemas: SchemaProp[]
    manualPropValues: any[]
    manualGroupNids: number[]
    manualGroupNTypes?: number[]
    manualGroupSchemas: SchemaUpdateGroup[]
    manualGroupValueOffsets: number[]
    manualGroupValues: any[]
    manualOpTypes: number[]
    manualOpIndexes: number[]
    manualNeedsCoalesce: boolean
}

export type EcsSpatialManualUpdateLog = CoalescingManualUpdateLog & {
    manualGroupNTypes: number[]
}

export function createEcsSpatialManualUpdateLog(): EcsSpatialManualUpdateLog {
    return {
        manualPropNids: [],
        manualPropSchemas: [],
        manualPropValues: [],
        manualGroupNids: [],
        manualGroupNTypes: [],
        manualGroupSchemas: [],
        manualGroupValueOffsets: [],
        manualGroupValues: [],
        manualOpTypes: [],
        manualOpIndexes: [],
        manualNeedsCoalesce: false
    }
}

export function clearEcsSpatialManualUpdateLog(log: EcsSpatialManualUpdateLog) {
    log.manualPropNids.length = 0
    log.manualPropSchemas.length = 0
    log.manualPropValues.length = 0
    log.manualGroupNids.length = 0
    log.manualGroupNTypes.length = 0
    log.manualGroupSchemas.length = 0
    log.manualGroupValueOffsets.length = 0
    log.manualGroupValues.length = 0
    log.manualOpTypes.length = 0
    log.manualOpIndexes.length = 0
    log.manualNeedsCoalesce = false
}

export function appendManualProp(
    log: CoalescingManualUpdateLog,
    nid: number,
    prop: SchemaProp,
    value: any
) {
    log.manualOpTypes.push(0)
    log.manualOpIndexes.push(log.manualPropNids.length)
    log.manualPropNids.push(nid)
    log.manualPropSchemas.push(prop)
    log.manualPropValues.push(value)
    log.manualNeedsCoalesce = true
}

export function appendManualGroup(
    log: CoalescingManualUpdateLog,
    nid: number,
    group: SchemaUpdateGroup,
    values: IArguments | any[],
    valueOffset = 0,
    ntype?: number
) {
    log.manualOpTypes.push(1)
    log.manualOpIndexes.push(log.manualGroupNids.length)
    log.manualGroupNids.push(nid)
    if (log.manualGroupNTypes) {
        log.manualGroupNTypes.push(ntype ?? 0)
    }
    log.manualGroupSchemas.push(group)
    log.manualGroupValueOffsets.push(log.manualGroupValues.length)
    for (let i = 0; i < group.props.length; i++) {
        log.manualGroupValues.push(values[i + valueOffset])
    }
    log.manualNeedsCoalesce = true
}

function appendManualGroupHeader(
    log: CoalescingManualUpdateLog,
    nid: number,
    group: SchemaUpdateGroup,
    ntype?: number
) {
    log.manualOpTypes.push(1)
    log.manualOpIndexes.push(log.manualGroupNids.length)
    log.manualGroupNids.push(nid)
    if (log.manualGroupNTypes) {
        log.manualGroupNTypes.push(ntype ?? 0)
    }
    log.manualGroupSchemas.push(group)
    log.manualGroupValueOffsets.push(log.manualGroupValues.length)
}

export function appendManualGroup1(
    log: CoalescingManualUpdateLog,
    nid: number,
    group: SchemaUpdateGroup,
    v0: any,
    ntype?: number
) {
    appendManualGroupHeader(log, nid, group, ntype)
    log.manualGroupValues.push(v0)
    log.manualNeedsCoalesce = true
}

export function appendManualGroup2(
    log: CoalescingManualUpdateLog,
    nid: number,
    group: SchemaUpdateGroup,
    v0: any,
    v1: any,
    ntype?: number
) {
    appendManualGroupHeader(log, nid, group, ntype)
    log.manualGroupValues.push(v0, v1)
    log.manualNeedsCoalesce = true
}

export function appendManualGroup3(
    log: CoalescingManualUpdateLog,
    nid: number,
    group: SchemaUpdateGroup,
    v0: any,
    v1: any,
    v2: any,
    ntype?: number
) {
    appendManualGroupHeader(log, nid, group, ntype)
    log.manualGroupValues.push(v0, v1, v2)
    log.manualNeedsCoalesce = true
}

export function appendManualGroup4(
    log: CoalescingManualUpdateLog,
    nid: number,
    group: SchemaUpdateGroup,
    v0: any,
    v1: any,
    v2: any,
    v3: any,
    ntype?: number
) {
    appendManualGroupHeader(log, nid, group, ntype)
    log.manualGroupValues.push(v0, v1, v2, v3)
    log.manualNeedsCoalesce = true
}

export function appendEcsSpatialManualProp(
    log: EcsSpatialManualUpdateLog,
    nid: number,
    prop: SchemaProp,
    value: any
) {
    appendManualProp(log, nid, prop, value)
}

export function appendEcsSpatialManualGroup(
    log: EcsSpatialManualUpdateLog,
    ntype: number,
    nid: number,
    group: SchemaUpdateGroup,
    values: IArguments | any[]
) {
    appendManualGroup(log, nid, group, values, 1, ntype)
}

function manualMutationKey(nid: number, key: number) {
    return nid * 256 + key
}

function manualLogHasCoalesceConflict(log: CoalescingManualUpdateLog) {
    if (log.manualOpTypes.length < 2) {
        return false
    }

    if (log.manualPropNids.length === 0) {
        const groupKeys = new Set<number>()
        for (let i = 0; i < log.manualGroupNids.length; i++) {
            const key = manualMutationKey(log.manualGroupNids[i], log.manualGroupSchemas[i].key)
            if (groupKeys.has(key)) {
                return true
            }
            groupKeys.add(key)
        }
        return false
    }

    if (log.manualGroupNids.length === 0) {
        const propKeys = new Set<number>()
        for (let i = 0; i < log.manualPropNids.length; i++) {
            const key = manualMutationKey(log.manualPropNids[i], log.manualPropSchemas[i].key)
            if (propKeys.has(key)) {
                return true
            }
            propKeys.add(key)
        }
        return false
    }

    const propKeys = new Set<number>()
    const groupKeys = new Set<number>()
    const groupPropKeys = new Set<number>()
    for (let i = 0; i < log.manualOpTypes.length; i++) {
        const index = log.manualOpIndexes[i]
        if (log.manualOpTypes[i] === 0) {
            const nid = log.manualPropNids[index]
            const prop = log.manualPropSchemas[index]
            const key = manualMutationKey(nid, prop.key)
            if (propKeys.has(key) || groupPropKeys.has(key)) {
                return true
            }
            propKeys.add(key)
            continue
        }

        const nid = log.manualGroupNids[index]
        const group = log.manualGroupSchemas[index]
        const groupKey = manualMutationKey(nid, group.key)
        if (groupKeys.has(groupKey)) {
            return true
        }
        for (let j = 0; j < group.props.length; j++) {
            const propKey = manualMutationKey(nid, group.props[j].key)
            if (propKeys.has(propKey)) {
                return true
            }
            groupPropKeys.add(propKey)
        }
        groupKeys.add(groupKey)
    }
    return false
}

export function coalesceManualUpdateLog(log: CoalescingManualUpdateLog) {
    if (!log.manualNeedsCoalesce) {
        return
    }
    if (!manualLogHasCoalesceConflict(log)) {
        log.manualOpTypes.length = 0
        log.manualOpIndexes.length = 0
        log.manualNeedsCoalesce = false
        return
    }

    const props = new Map<number, { nid: number, prop: SchemaProp, value: any }>()
    const groups = new Map<number, { nid: number, ntype: number | undefined, group: SchemaUpdateGroup, values: any[] }>()
    const splitGroupsForProp = (nid: number, prop: SchemaProp) => {
        groups.forEach((entry, key) => {
            if (entry.nid !== nid) {
                return
            }
            let overlaps = false
            for (let i = 0; i < entry.group.props.length; i++) {
                if (entry.group.props[i].key === prop.key) {
                    overlaps = true
                    break
                }
            }
            if (!overlaps) {
                return
            }
            for (let i = 0; i < entry.group.props.length; i++) {
                const groupProp = entry.group.props[i]
                props.set(manualMutationKey(nid, groupProp.key), { nid, prop: groupProp, value: entry.values[i] })
            }
            groups.delete(key)
        })
    }

    for (let i = 0; i < log.manualOpTypes.length; i++) {
        const index = log.manualOpIndexes[i]
        if (log.manualOpTypes[i] === 0) {
            const nid = log.manualPropNids[index]
            const prop = log.manualPropSchemas[index]
            splitGroupsForProp(nid, prop)
            props.set(manualMutationKey(nid, prop.key), {
                nid,
                prop,
                value: log.manualPropValues[index]
            })
            continue
        }

        const nid = log.manualGroupNids[index]
        const group = log.manualGroupSchemas[index]
        for (let j = 0; j < group.props.length; j++) {
            props.delete(manualMutationKey(nid, group.props[j].key))
        }
        const values = []
        let offset = log.manualGroupValueOffsets[index]
        for (let j = 0; j < group.props.length; j++) {
            values.push(log.manualGroupValues[offset++])
        }
        groups.set(manualMutationKey(nid, group.key), {
            nid,
            ntype: log.manualGroupNTypes?.[index],
            group,
            values
        })
    }

    log.manualPropNids.length = 0
    log.manualPropSchemas.length = 0
    log.manualPropValues.length = 0
    props.forEach(entry => {
        log.manualPropNids.push(entry.nid)
        log.manualPropSchemas.push(entry.prop)
        log.manualPropValues.push(entry.value)
    })

    log.manualGroupNids.length = 0
    if (log.manualGroupNTypes) {
        log.manualGroupNTypes.length = 0
    }
    log.manualGroupSchemas.length = 0
    log.manualGroupValueOffsets.length = 0
    log.manualGroupValues.length = 0
    groups.forEach(entry => {
        log.manualGroupNids.push(entry.nid)
        if (log.manualGroupNTypes) {
            log.manualGroupNTypes.push(entry.ntype ?? 0)
        }
        log.manualGroupSchemas.push(entry.group)
        log.manualGroupValueOffsets.push(log.manualGroupValues.length)
        for (let i = 0; i < entry.values.length; i++) {
            log.manualGroupValues.push(entry.values[i])
        }
    })

    log.manualOpTypes.length = 0
    log.manualOpIndexes.length = 0
    log.manualNeedsCoalesce = false
}

export function coalesceEcsSpatialManualUpdateLog(log: EcsSpatialManualUpdateLog) {
    coalesceManualUpdateLog(log)
}
