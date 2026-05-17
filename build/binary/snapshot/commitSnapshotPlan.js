"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commitSnapshotPlan = commitSnapshotPlan;
function commitSnapshotPlan(user, plan) {
    if (plan.responses.length === 0) {
        return;
    }
    const sentResponses = new Set(plan.responses);
    user.responseQueue = user.responseQueue.filter(response => !sentResponses.has(response));
}
