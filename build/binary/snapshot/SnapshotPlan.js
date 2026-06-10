"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptySnapshotPlan = createEmptySnapshotPlan;
function createEmptySnapshotPlan() {
    return {
        engineMessages: [],
        messages: [],
        responses: [],
        channelEntityCreates: [],
        channelHeaderCreates: [],
        channelHeaderUpdates: [],
        channelHeaderDeletes: [],
        channelHeaderVersions: [],
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        createEntities: [],
        updateEntities: [],
        updateEntityGroups: [],
        deleteEntities: []
    };
}
