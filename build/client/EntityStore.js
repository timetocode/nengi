"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityStore = void 0;
const Frame_1 = require("./Frame");
const time_1 = require("./time");
const EntityHistory_1 = require("./EntityHistory");
function cloneEntity(entity) {
    return Object.assign({}, entity);
}
class EntityStore {
    constructor(context) {
        this.entities = new Map();
        this.ntypes = new Map();
        this.channelHeaders = new Map();
        this.entityChannels = new Map();
        this.ecsEntities = new Set();
        this.ecsComponentsByParent = new Map();
        this.ecsComponentParent = new Map();
        this.context = context;
        this.history = new EntityHistory_1.EntityHistory(context);
    }
    get(nid) {
        return this.entities.get(nid);
    }
    getByNType(ntype) {
        return Array.from(this.entities.values()).filter(entity => entity.ntype === ntype);
    }
    getChannelId(nid) {
        return this.entityChannels.get(nid);
    }
    getChannelHeader(channelOrEntityNid) {
        const entityChannelId = this.entityChannels.get(channelOrEntityNid);
        return this.channelHeaders.get(entityChannelId === undefined ? channelOrEntityNid : entityChannelId);
    }
    getByChannel(channelId) {
        return Array.from(this.entityChannels.entries())
            .filter(([, entityChannelId]) => entityChannelId === channelId)
            .map(([nid]) => this.entities.get(nid))
            .filter((entity) => !!entity);
    }
    getWhere(prop, value) {
        return Array.from(this.entities.values()).filter(entity => entity[prop] === value);
    }
    applySnapshot(snapshot, tick, receivedAt = (0, time_1.getLocalTime)()) {
        const createEntities = [];
        const updateEntities = [];
        const deleteEntities = [];
        const deletedEntities = [];
        const closedChannels = [];
        const ecsCreateEntities = [];
        const ecsCreateComponents = [];
        const ecsDeleteEntities = [];
        const channelEntityCreates = (snapshot.channelEntityCreates || []).slice();
        const channelHeaderCreates = (snapshot.channelHeaderCreates || []).slice();
        const channelHeaderUpdates = (snapshot.channelHeaderUpdates || []).slice();
        const channelHeaderDeletes = (snapshot.channelHeaderDeletes || []).slice();
        const changedNids = new Set();
        const snapshotDeleteNids = new Set(snapshot.deleteEntities);
        channelHeaderDeletes.forEach(headerDelete => {
            const previous = this.channelHeaders.get(headerDelete.channelId);
            if (previous) {
                headerDelete.header = cloneEntity(previous);
            }
            const entityNids = this.purgeChannel(headerDelete.channelId, tick);
            closedChannels.push({
                channelId: headerDelete.channelId,
                header: previous ? cloneEntity(previous) : undefined,
                entityNids
            });
            this.channelHeaders.delete(headerDelete.channelId);
        });
        channelHeaderCreates.forEach(headerCreate => {
            this.channelHeaders.set(headerCreate.channelId, cloneEntity(headerCreate.header));
        });
        channelHeaderUpdates.forEach(headerUpdate => {
            const header = this.channelHeaders.get(headerUpdate.channelId);
            if (!header) {
                return;
            }
            headerUpdate.changes.forEach(update => {
                const nschema = this.context.getSchema(header.ntype);
                const propData = nschema.props[update.prop];
                header[update.prop] = propData.binary.clone(update.value);
            });
        });
        (snapshot.ecsDeleteEntities || []).forEach(pid => {
            const components = this.ecsComponentsByParent.get(pid);
            if (components) {
                components.forEach(nid => {
                    if (snapshotDeleteNids.has(nid)) {
                        return;
                    }
                    const previous = this.entities.get(nid);
                    const channelId = this.entityChannels.get(nid);
                    this.entities.delete(nid);
                    this.ntypes.delete(nid);
                    this.entityChannels.delete(nid);
                    this.ecsComponentParent.delete(nid);
                    deleteEntities.push(nid);
                    deletedEntities.push({
                        nid,
                        entity: previous ? cloneEntity(previous) : undefined,
                        channelId
                    });
                    this.history.recordDelete(tick, nid);
                });
            }
            this.ecsComponentsByParent.delete(pid);
            this.ecsEntities.delete(pid);
            this.entityChannels.delete(pid);
            ecsDeleteEntities.push(pid);
        });
        snapshot.deleteEntities.forEach(nid => {
            var _a;
            const previous = this.entities.get(nid);
            const channelId = this.entityChannels.get(nid);
            this.entities.delete(nid);
            this.ntypes.delete(nid);
            this.entityChannels.delete(nid);
            const pid = this.ecsComponentParent.get(nid);
            if (pid !== undefined) {
                this.ecsComponentParent.delete(nid);
                (_a = this.ecsComponentsByParent.get(pid)) === null || _a === void 0 ? void 0 : _a.delete(nid);
            }
            deleteEntities.push(nid);
            deletedEntities.push({
                nid,
                entity: previous ? cloneEntity(previous) : undefined,
                channelId
            });
            this.history.recordDelete(tick, nid);
        });
        (snapshot.ecsCreateEntities || []).forEach(pid => {
            this.ecsEntities.add(pid);
            if (!this.ecsComponentsByParent.has(pid)) {
                this.ecsComponentsByParent.set(pid, new Set());
            }
            ecsCreateEntities.push(pid);
        });
        (snapshot.ecsCreateComponents || []).forEach(component => {
            const stored = cloneEntity(component);
            const pid = stored.pid;
            this.entities.set(stored.nid, stored);
            this.ntypes.set(stored.nid, stored.ntype);
            this.ecsComponentParent.set(stored.nid, pid);
            if (!this.ecsComponentsByParent.has(pid)) {
                this.ecsComponentsByParent.set(pid, new Set());
            }
            this.ecsComponentsByParent.get(pid).add(stored.nid);
            createEntities.push(cloneEntity(stored));
            ecsCreateComponents.push(cloneEntity(stored));
            changedNids.add(stored.nid);
        });
        snapshot.createEntities.forEach(entity => {
            const stored = cloneEntity(entity);
            this.entities.set(stored.nid, stored);
            this.ntypes.set(stored.nid, stored.ntype);
            createEntities.push(cloneEntity(stored));
            changedNids.add(stored.nid);
        });
        channelEntityCreates.forEach(create => {
            this.entityChannels.set(create.nid, create.channelId);
        });
        snapshot.updateEntities.forEach(update => {
            const entity = this.entities.get(update.nid);
            if (!entity) {
                return;
            }
            const nschema = this.context.getSchema(entity.ntype);
            const propData = nschema.props[update.prop];
            const previous = propData.binary.clone(entity[update.prop]);
            const value = propData.binary.clone(update.value);
            if (propData.binary.compare(previous, value)) {
                return;
            }
            entity[update.prop] = propData.binary.clone(update.value);
            updateEntities.push({
                nid: update.nid,
                prop: update.prop,
                previous,
                value
            });
            changedNids.add(update.nid);
        });
        changedNids.forEach(nid => {
            const entity = this.entities.get(nid);
            if (entity) {
                this.history.recordState(tick, entity);
            }
        });
        return new Frame_1.Frame({
            tick,
            timestamp: snapshot.timestamp,
            receivedAt,
            confirmedClientTick: snapshot.confirmedClientTick,
            ecsCreateEntities,
            ecsCreateComponents,
            ecsDeleteEntities,
            channelEntityCreates,
            channelHeaderCreates,
            channelHeaderUpdates,
            channelHeaderDeletes,
            closedChannels,
            createEntities,
            updateEntities,
            deleteEntities,
            deletedEntities,
            messages: snapshot.messages.slice()
        });
    }
    purgeChannel(channelId, tick) {
        var _a;
        const purged = [];
        const entries = Array.from(this.entityChannels.entries());
        for (let i = 0; i < entries.length; i++) {
            const [nid, entityChannelId] = entries[i];
            if (entityChannelId !== channelId) {
                continue;
            }
            if (this.entityChannels.get(nid) !== channelId) {
                continue;
            }
            purged.push(nid);
            this.entityChannels.delete(nid);
            this.ntypes.delete(nid);
            this.entities.delete(nid);
            this.ecsEntities.delete(nid);
            const pid = this.ecsComponentParent.get(nid);
            if (pid !== undefined) {
                this.ecsComponentParent.delete(nid);
                (_a = this.ecsComponentsByParent.get(pid)) === null || _a === void 0 ? void 0 : _a.delete(nid);
            }
            const components = this.ecsComponentsByParent.get(nid);
            if (components) {
                components.forEach(componentNid => {
                    this.entityChannels.delete(componentNid);
                    this.ntypes.delete(componentNid);
                    this.entities.delete(componentNid);
                    this.ecsComponentParent.delete(componentNid);
                    purged.push(componentNid);
                    this.history.recordDelete(tick, componentNid);
                });
                this.ecsComponentsByParent.delete(nid);
            }
            this.history.recordDelete(tick, nid);
        }
        return purged;
    }
}
exports.EntityStore = EntityStore;
