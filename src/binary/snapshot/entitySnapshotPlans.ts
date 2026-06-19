import { Instance } from '../../server/Instance'
import { SnapshotPlan, createEmptySnapshotPlan } from './SnapshotPlan'
import { CellFragmentChannel, SharedUpdateChannel } from './channelModes'

export function collectChannelUpdatePlan(instance: Instance, channel: SharedUpdateChannel, excludedNids?: Set<number>): SnapshotPlan {
    const plan = createEmptySnapshotPlan()
    const entities = channel.entities.array

    for (let i = 0; i < entities.length; i++) {
        instance.localState.forEachEntityTree(entities[i].nid, nid => {
            if (excludedNids?.has(nid)) {
                return
            }
            collectEntityUpdatePlan(instance, instance.localState.getByNid(nid), plan)
        })
    }

    return plan
}

export function collectSpatialCellUpdatePlan(instance: Instance, channel: CellFragmentChannel, cellKey: string): SnapshotPlan {
    const plan = createEmptySnapshotPlan()
    const entities = channel.getCellEntities(cellKey)

    for (let i = 0; i < entities.length; i++) {
        instance.localState.forEachEntityTree(entities[i].nid, nid => {
            collectEntityUpdatePlan(instance, instance.localState.getByNid(nid), plan)
        })
    }

    return plan
}

export function collectEntityUpdatePlan(instance: Instance, entity: any, plan: SnapshotPlan) {
    const nschema = instance.context.getSchema(entity.ntype)!
    const diffs = instance.cache.getAndDiffGrouped(instance.tick, entity, nschema)
    for (let j = 0; j < diffs.groups.length; j++) {
        plan.updateEntityGroups.push(diffs.groups[j])
    }
    for (let j = 0; j < diffs.changes.length; j++) {
        plan.updateEntities.push(diffs.changes[j])
    }
}

export function collectCreateEntitiesForRoots(instance: Instance, roots: any[]) {
    const createEntities: any[] = []
    const nids = new Set<number>()
    for (let i = 0; i < roots.length; i++) {
        instance.localState.forEachEntityTree(roots[i].nid, nid => {
            const entity = instance.localState.getByNid(nid)
            const nschema = instance.context.getSchema(entity.ntype)!
            if (!nschema) {
                throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`)
            }
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema)
            }
            createEntities.push(entity)
            nids.add(nid)
        })
    }
    return { createEntities, nids }
}

export function collectNidsForRoots(instance: Instance, roots: any[]) {
    const nids = new Set<number>()
    for (let i = 0; i < roots.length; i++) {
        instance.localState.forEachEntityTree(roots[i].nid, nid => {
            nids.add(nid)
        })
    }
    return nids
}

export function addRegularCreate(plan: SnapshotPlan, instance: Instance, nid: number) {
    const entity = instance.localState.getByNid(nid)
    const nschema = instance.context.getSchema(entity.ntype)!
    if (!nschema) {
        throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`)
    }
    if (!instance.cache.cacheContains(nid)) {
        instance.cache.cacheify(instance.tick, entity, nschema)
    }
    plan.createEntities.push(entity)
}

export function addRegularUpdate(plan: SnapshotPlan, instance: Instance, nid: number) {
    const entity = instance.localState.getByNid(nid)
    collectEntityUpdatePlan(instance, entity, plan)
}
