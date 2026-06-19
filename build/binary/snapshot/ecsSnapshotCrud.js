"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addEcsVisibilityCrud = addEcsVisibilityCrud;
function addEcsVisibilityCrud(plan, channel, toCreate, toDelete) {
    addEcsCreates(plan, channel, toCreate);
    addEcsDeletes(plan, channel, toDelete);
}
function addEcsCreates(plan, channel, toCreate) {
    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i];
        if (channel.isRootNid(nid)) {
            plan.ecsCreateEntities.push(nid);
        }
        else if (channel.isComponentNid(nid)) {
            const component = channel.getComponent(nid);
            if (component) {
                plan.ecsCreateComponents.push(component);
            }
        }
    }
}
function addEcsDeletes(plan, channel, toDelete) {
    const deletingRoots = new Set();
    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i];
        if (channel.isRootNid(nid)) {
            deletingRoots.add(nid);
            plan.ecsDeleteEntities.push(nid);
        }
    }
    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i];
        if (channel.isRootNid(nid)) {
            continue;
        }
        const component = channel.getComponent(nid);
        if (channel.isRootDeletedComponentNid(nid) || (component && deletingRoots.has(component.pid))) {
            continue;
        }
        plan.deleteEntities.push(nid);
    }
}
