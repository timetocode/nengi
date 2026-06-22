import { SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'

export type EcsSpatialManualUpdateLog = {
    manualPropNids: number[]
    manualPropSchemas: SchemaProp[]
    manualPropValues: any[]
    manualGroupNids: number[]
    manualGroupNTypes: number[]
    manualGroupSchemas: SchemaUpdateGroup[]
    manualGroupValueOffsets: number[]
    manualGroupValues: any[]
    manualOpTypes: number[]
    manualOpIndexes: number[]
    manualNeedsCoalesce: boolean
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

export function appendEcsSpatialManualProp(
    log: EcsSpatialManualUpdateLog,
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

export function appendEcsSpatialManualGroup(
    log: EcsSpatialManualUpdateLog,
    ntype: number,
    nid: number,
    group: SchemaUpdateGroup,
    values: IArguments | any[]
) {
    log.manualOpTypes.push(1)
    log.manualOpIndexes.push(log.manualGroupNids.length)
    log.manualGroupNids.push(nid)
    log.manualGroupNTypes.push(ntype)
    log.manualGroupSchemas.push(group)
    log.manualGroupValueOffsets.push(log.manualGroupValues.length)
    for (let i = 0; i < group.props.length; i++) {
        log.manualGroupValues.push(values[i + 1])
    }
    log.manualNeedsCoalesce = true
}

function manualMutationKey(nid: number, key: number) {
    return nid * 256 + key
}

function manualLogHasCoalesceConflict(log: EcsSpatialManualUpdateLog) {
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

export function coalesceEcsSpatialManualUpdateLog(log: EcsSpatialManualUpdateLog) {
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
    const groups = new Map<number, { nid: number, ntype: number, group: SchemaUpdateGroup, values: any[] }>()
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
            ntype: log.manualGroupNTypes[index],
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
    log.manualGroupNTypes.length = 0
    log.manualGroupSchemas.length = 0
    log.manualGroupValueOffsets.length = 0
    log.manualGroupValues.length = 0
    groups.forEach(entry => {
        log.manualGroupNids.push(entry.nid)
        log.manualGroupNTypes.push(entry.ntype)
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
