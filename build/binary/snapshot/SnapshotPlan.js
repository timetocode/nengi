"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptySnapshotPlan = createEmptySnapshotPlan;
function createEmptySnapshotPlan() {
    return {
        engineMessages: [],
        messages: [],
        interpolatedMessages: [],
        channels: [],
        responses: [],
        channelOpens: [],
        channelHeaderUpdates: [],
        channelCloses: [],
        channelHeaderVersions: [],
        skipInterpolationNids: [],
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        createEntities: [],
        updateEntities: [],
        updateEntityGroups: [],
        deleteEntities: []
    };
}
