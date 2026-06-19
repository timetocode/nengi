"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityStore = void 0;
const ChannelHeader_1 = require("../common/ChannelHeader");
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
        this.channels = new Set();
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
    getEntityChannelId(nid) {
        return this.entityChannels.get(nid);
    }
    getChannelId(nid) {
        return this.getEntityChannelId(nid);
    }
    getChannelHeaderById(channelId) {
        return this.channelHeaders.get(channelId);
    }
    getEntityChannelHeader(nid) {
        const channelId = this.entityChannels.get(nid);
        return channelId === undefined ? undefined : this.channelHeaders.get(channelId);
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
        this.assertNoTopLevelEntityCrud(snapshot);
        const openedChannels = [];
        const closedChannels = [];
        const channelOpens = snapshot.channelOpens || [];
        const channelHeaderUpdates = snapshot.channelHeaderUpdates || [];
        const channelCloses = snapshot.channelCloses || [];
        const scopedChannels = snapshot.channels || [];
        const frameChannels = scopedChannels.map(channel => ({
            channelId: channel.channelId,
            ecsCreateEntities: [],
            ecsCreateComponents: [],
            ecsDeleteEntities: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: [],
            deletedEntities: [],
            messages: channel.messages.slice(),
            interpolatedMessages: channel.interpolatedMessages.slice()
        }));
        const channelFramesById = new Map();
        frameChannels.forEach(channel => channelFramesById.set(channel.channelId, channel));
        const changedNids = new Set();
        channelOpens.forEach(open => {
            this.channels.add(open.channelId);
            const header = (0, ChannelHeader_1.cloneChannelHeader)(open.header);
            this.channelHeaders.set(open.channelId, header);
            openedChannels.push({ channelId: open.channelId, header: (0, ChannelHeader_1.cloneChannelHeader)(header) });
        });
        channelHeaderUpdates.forEach(headerUpdate => {
            const header = this.requireChannelHeader(headerUpdate.channelId);
            headerUpdate.changes.forEach(update => {
                const nschema = this.context.getSchema(header.ntype);
                const propData = nschema.props[update.prop];
                header[update.prop] = propData.binary.clone(update.value);
            });
        });
        scopedChannels.forEach(channel => {
            const frameChannel = channelFramesById.get(channel.channelId);
            this.applyChannelSnapshot(channel, frameChannel, tick, {
                changedNids
            });
        });
        changedNids.forEach(nid => {
            const entity = this.entities.get(nid);
            if (entity) {
                this.history.recordState(tick, entity);
            }
        });
        channelCloses.forEach(close => {
            const previous = this.requireChannelHeader(close.channelId);
            const entityNids = this.purgeChannel(close.channelId, tick);
            closedChannels.push({
                channelId: close.channelId,
                header: (0, ChannelHeader_1.cloneChannelHeader)(previous),
                entityNids
            });
            this.channelHeaders.delete(close.channelId);
            this.channels.delete(close.channelId);
        });
        return new Frame_1.Frame({
            tick,
            timestamp: snapshot.timestamp,
            receivedAt,
            confirmedClientTick: snapshot.confirmedClientTick,
            channelOpens,
            channelHeaderUpdates,
            channelCloses,
            skipInterpolationNids: (snapshot.skipInterpolationNids || []).slice(),
            openedChannels,
            closedChannels,
            messages: snapshot.messages.slice(),
            interpolatedMessages: (snapshot.interpolatedMessages || []).slice(),
            channels: frameChannels
        });
    }
    applyChannelSnapshot(channel, frame, tick, state) {
        this.requireChannelHeader(channel.channelId);
        channel.ecsCreateEntities.forEach(pid => {
            this.createEcsEntity(channel.channelId, pid, frame, state);
        });
        channel.ecsCreateComponents.forEach(component => {
            this.createEcsComponent(channel.channelId, component, frame, state);
        });
        channel.createEntities.forEach(entity => {
            this.createEntity(channel.channelId, entity, frame, state);
        });
        channel.updateEntities.forEach(update => {
            this.updateEntity(channel.channelId, update, frame, state);
        });
        channel.deleteEntities.forEach(nid => {
            this.deleteEntity(channel.channelId, nid, frame, state, tick);
        });
        channel.ecsDeleteEntities.forEach(pid => {
            this.deleteEcsEntity(channel.channelId, pid, frame, state, tick);
        });
    }
    createEcsEntity(channelId, pid, frame, state) {
        this.assertNidAvailable(pid, channelId);
        this.ecsEntities.add(pid);
        this.entityChannels.set(pid, channelId);
        if (!this.ecsComponentsByParent.has(pid)) {
            this.ecsComponentsByParent.set(pid, new Set());
        }
        frame.ecsCreateEntities.push(pid);
    }
    createEcsComponent(channelId, component, frame, state) {
        const pid = component.pid;
        if (typeof pid !== 'number') {
            throw new Error(`ECS component ${component.nid} is missing pid.`);
        }
        this.assertOwnedByChannel(pid, channelId);
        this.assertNidAvailable(component.nid, channelId);
        const stored = cloneEntity(component);
        this.entities.set(stored.nid, stored);
        this.ntypes.set(stored.nid, stored.ntype);
        this.entityChannels.set(stored.nid, channelId);
        this.ecsComponentParent.set(stored.nid, pid);
        this.ecsComponentsByParent.get(pid).add(stored.nid);
        const clone = cloneEntity(stored);
        frame.createEntities.push(clone);
        frame.ecsCreateComponents.push(cloneEntity(stored));
        state.changedNids.add(stored.nid);
    }
    createEntity(channelId, entity, frame, state) {
        this.assertNidAvailable(entity.nid, channelId);
        const stored = cloneEntity(entity);
        this.entities.set(stored.nid, stored);
        this.ntypes.set(stored.nid, stored.ntype);
        this.entityChannels.set(stored.nid, channelId);
        frame.createEntities.push(cloneEntity(stored));
        state.changedNids.add(stored.nid);
    }
    updateEntity(channelId, update, frame, state) {
        this.assertOwnedByChannel(update.nid, channelId);
        const entity = this.entities.get(update.nid);
        if (!entity) {
            throw new Error(`Cannot update missing entity nid ${update.nid} in channel ${channelId}.`);
        }
        const nschema = this.context.getSchema(entity.ntype);
        const propData = nschema.props[update.prop];
        const previous = propData.binary.clone(entity[update.prop]);
        const value = propData.binary.clone(update.value);
        if (propData.binary.compare(previous, value)) {
            return;
        }
        entity[update.prop] = propData.binary.clone(update.value);
        const applied = {
            nid: update.nid,
            prop: update.prop,
            previous,
            value
        };
        frame.updateEntities.push(applied);
        state.changedNids.add(update.nid);
    }
    deleteEntity(channelId, nid, frame, state, tick) {
        var _a;
        this.assertOwnedByChannel(nid, channelId);
        const previous = this.entities.get(nid);
        if (!previous) {
            throw new Error(`Cannot delete missing entity nid ${nid} in channel ${channelId}.`);
        }
        this.entities.delete(nid);
        this.ntypes.delete(nid);
        this.entityChannels.delete(nid);
        const pid = this.ecsComponentParent.get(nid);
        if (pid !== undefined) {
            this.ecsComponentParent.delete(nid);
            (_a = this.ecsComponentsByParent.get(pid)) === null || _a === void 0 ? void 0 : _a.delete(nid);
        }
        const deleted = {
            nid,
            entity: cloneEntity(previous),
            channelId
        };
        frame.deleteEntities.push(nid);
        frame.deletedEntities.push(deleted);
        this.history.recordDelete(tick, nid);
    }
    deleteEcsEntity(channelId, pid, frame, state, tick) {
        this.assertOwnedByChannel(pid, channelId);
        const components = Array.from(this.ecsComponentsByParent.get(pid) || []);
        for (let i = 0; i < components.length; i++) {
            const componentNid = components[i];
            if (this.entities.has(componentNid)) {
                this.deleteEntity(channelId, componentNid, frame, state, tick);
            }
        }
        this.ecsComponentsByParent.delete(pid);
        this.ecsEntities.delete(pid);
        this.entityChannels.delete(pid);
        frame.ecsDeleteEntities.push(pid);
        this.history.recordDelete(tick, pid);
    }
    assertNoTopLevelEntityCrud(snapshot) {
        var _a, _b, _c;
        const hasTopLevelCrud = snapshot.createEntities.length > 0 ||
            snapshot.updateEntities.length > 0 ||
            snapshot.deleteEntities.length > 0 ||
            (((_a = snapshot.ecsCreateEntities) === null || _a === void 0 ? void 0 : _a.length) || 0) > 0 ||
            (((_b = snapshot.ecsCreateComponents) === null || _b === void 0 ? void 0 : _b.length) || 0) > 0 ||
            (((_c = snapshot.ecsDeleteEntities) === null || _c === void 0 ? void 0 : _c.length) || 0) > 0;
        if (hasTopLevelCrud) {
            throw new Error('EntityStore requires channel-scoped entity CRUD.');
        }
    }
    requireChannelHeader(channelId) {
        const header = this.channelHeaders.get(channelId);
        if (!header) {
            throw new Error(`Missing channel ${channelId}.`);
        }
        return header;
    }
    assertNidAvailable(nid, channelId) {
        const existingChannelId = this.entityChannels.get(nid);
        if (existingChannelId !== undefined) {
            throw new Error(`Nid ${nid} already belongs to channel ${existingChannelId}, cannot create in channel ${channelId}.`);
        }
    }
    assertOwnedByChannel(nid, channelId) {
        const existingChannelId = this.entityChannels.get(nid);
        if (existingChannelId !== channelId) {
            throw new Error(`Nid ${nid} belongs to channel ${existingChannelId !== null && existingChannelId !== void 0 ? existingChannelId : 'none'}, not channel ${channelId}.`);
        }
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
