import { SnapshotPlan } from './SnapshotPlan'

type PlannedSnapshot = SnapshotPlan | { plan: SnapshotPlan }

function getPlannedSnapshot(plan: PlannedSnapshot) {
    return 'plan' in plan ? plan.plan : plan
}

export function sumPlanCreates(plans: PlannedSnapshot[]) {
    let creates = 0
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i])
        creates += plan.createEntities.length + plan.ecsCreateEntities.length + plan.ecsCreateComponents.length
    }
    return creates
}

export function sumPlanDeletes(plans: PlannedSnapshot[]) {
    let deletes = 0
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i])
        deletes += plan.deleteEntities.length + plan.ecsDeleteEntities.length
    }
    return deletes
}

export function sumPlanUpdateProps(plans: PlannedSnapshot[]) {
    let props = 0
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i])
        props += plan.updateEntities.length
    }
    return props
}

export function sumPlanUpdateGroups(plans: PlannedSnapshot[]) {
    let groups = 0
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i])
        groups += plan.updateEntityGroups.length
    }
    return groups
}

export function sumPlanGroupedUpdateProps(plans: PlannedSnapshot[]) {
    let props = 0
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i])
        props += plan.updateEntityGroups.reduce((total: number, update: any) => total + update.group.props.length, 0)
    }
    return props
}

export function countPlanMessages(plan: SnapshotPlan) {
    return plan.messages.length + plan.interpolatedMessages.length
}

export function sumPlanMessages(plans: PlannedSnapshot[]) {
    let messages = 0
    for (let i = 0; i < plans.length; i++) {
        messages += countPlanMessages(getPlannedSnapshot(plans[i]))
    }
    return messages
}
