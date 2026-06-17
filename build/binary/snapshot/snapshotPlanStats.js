"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sumPlanCreates = sumPlanCreates;
exports.sumPlanDeletes = sumPlanDeletes;
exports.sumPlanUpdateProps = sumPlanUpdateProps;
exports.sumPlanUpdateGroups = sumPlanUpdateGroups;
exports.sumPlanGroupedUpdateProps = sumPlanGroupedUpdateProps;
exports.countPlanMessages = countPlanMessages;
exports.sumPlanMessages = sumPlanMessages;
function getPlannedSnapshot(plan) {
    return 'plan' in plan ? plan.plan : plan;
}
function sumPlanCreates(plans) {
    let creates = 0;
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i]);
        creates += plan.createEntities.length + plan.ecsCreateEntities.length + plan.ecsCreateComponents.length;
    }
    return creates;
}
function sumPlanDeletes(plans) {
    let deletes = 0;
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i]);
        deletes += plan.deleteEntities.length + plan.ecsDeleteEntities.length;
    }
    return deletes;
}
function sumPlanUpdateProps(plans) {
    let props = 0;
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i]);
        props += plan.updateEntities.length;
    }
    return props;
}
function sumPlanUpdateGroups(plans) {
    let groups = 0;
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i]);
        groups += plan.updateEntityGroups.length;
    }
    return groups;
}
function sumPlanGroupedUpdateProps(plans) {
    let props = 0;
    for (let i = 0; i < plans.length; i++) {
        const plan = getPlannedSnapshot(plans[i]);
        props += plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0);
    }
    return props;
}
function countPlanMessages(plan) {
    return plan.messages.length + plan.interpolatedMessages.length;
}
function sumPlanMessages(plans) {
    let messages = 0;
    for (let i = 0; i < plans.length; i++) {
        messages += countPlanMessages(getPlannedSnapshot(plans[i]));
    }
    return messages;
}
