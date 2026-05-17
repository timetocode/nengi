"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptySnapshotPlan = createEmptySnapshotPlan;
function createEmptySnapshotPlan() {
    return {
        engineMessages: [],
        messages: [],
        responses: [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: []
    };
}
