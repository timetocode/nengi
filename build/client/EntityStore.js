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
        const createEntities = [];
        const updateEntities = [];
        const deleteEntities = [];
        const deletedEntities = [];
        const openedChannels = [];
        const closedChannels = [];
        const ecsCreateEntities = [];
        const ecsCreateComponents = [];
        const ecsDeleteEntities = [];
        const channelOpens = snapshot.channelOpens || [];
        const channelEntityCreates = snapshot.channelEntityCreates || [];
        const channelHeaderUpdates = snapshot.channelHeaderUpdates || [];
        const channelCloses = snapshot.channelCloses || [];
        const scopedChannels = snapshot.channels || [];
        const frameChannels = scopedChannels.map(channel => ({
            channelId: channel.channelId,
            ecsCreateEntities: channel.ecsCreateEntities.slice(),
            ecsCreateComponents: [],
            ecsDeleteEntities: channel.ecsDeleteEntities.slice(),
            createEntities: [],
            updateEntities: [],
            deleteEntities: [],
            deletedEntities: [],
            messages: channel.messages.slice(),
            interpolatedMessages: channel.interpolatedMessages.slice()
        }));
        const channelFramesById = new Map();
        frameChannels.forEach(channel => channelFramesById.set(channel.channelId, channel));
        scopedChannels.forEach(channel => {
            var _a, _b, _c, _d;
            snapshot.messages.push(...channel.messages);
            (_a = snapshot.interpolatedMessages) === null || _a === void 0 ? void 0 : _a.push(...channel.interpolatedMessages);
            (_b = snapshot.ecsCreateEntities) === null || _b === void 0 ? void 0 : _b.push(...channel.ecsCreateEntities);
            (_c = snapshot.ecsCreateComponents) === null || _c === void 0 ? void 0 : _c.push(...channel.ecsCreateComponents);
            (_d = snapshot.ecsDeleteEntities) === null || _d === void 0 ? void 0 : _d.push(...channel.ecsDeleteEntities);
            snapshot.createEntities.push(...channel.createEntities);
            snapshot.updateEntities.push(...channel.updateEntities);
            snapshot.deleteEntities.push(...channel.deleteEntities);
            channel.ecsCreateEntities.forEach(nid => channelEntityCreates.push({ nid, channelId: channel.channelId }));
            channel.ecsCreateComponents.forEach(component => channelEntityCreates.push({ nid: component.nid, channelId: channel.channelId }));
            channel.createEntities.forEach(entity => channelEntityCreates.push({ nid: entity.nid, channelId: channel.channelId }));
        });
        const changedNids = new Set();
        const snapshotDeleteNids = new Set(snapshot.deleteEntities);
        const scopedCreateNidsByChannel = new Map();
        const scopedUpdateNidsByChannel = new Map();
        const scopedDeleteNidsByChannel = new Map();
        scopedChannels.forEach(channel => {
            scopedCreateNidsByChannel.set(channel.channelId, new Set([
                ...channel.createEntities.map(entity => entity.nid),
                ...channel.ecsCreateComponents.map(component => component.nid)
            ]));
            scopedUpdateNidsByChannel.set(channel.channelId, new Set(channel.updateEntities.map(update => update.nid)));
            scopedDeleteNidsByChannel.set(channel.channelId, new Set([
                ...channel.deleteEntities,
                ...channel.ecsDeleteEntities
            ]));
        });
        channelOpens.forEach(open => {
            this.channels.add(open.channelId);
            const header = (0, ChannelHeader_1.cloneChannelHeader)(open.header);
            this.channelHeaders.set(open.channelId, header);
            openedChannels.push({ channelId: open.channelId, header: (0, ChannelHeader_1.cloneChannelHeader)(header) });
        });
        channelCloses.forEach(close => {
            const previous = this.channelHeaders.get(close.channelId);
            // Channel close sends only the channel id. The client already knows
            // which local nids arrived through that channel, so it derives the
            // purged list without paying for per-entity deletes on the wire.
            const entityNids = this.purgeChannel(close.channelId, tick);
            closedChannels.push({
                channelId: close.channelId,
                header: (0, ChannelHeader_1.cloneChannelHeader)(previous),
                entityNids
            });
            this.channelHeaders.delete(close.channelId);
            this.channels.delete(close.channelId);
        });
        channelHeaderUpdates.forEach(headerUpdate => {
            const header = this.channelHeaders.get(headerUpdate.channelId);
            headerUpdate.changes.forEach(update => {
                const nschema = this.context.getSchema(header.ntype);
                const propData = nschema.props[update.prop];
                header[update.prop] = propData.binary.clone(update.value);
            });
        });
        channelEntityCreates.forEach(create => {
            this.channels.add(create.channelId);
            this.entityChannels.set(create.nid, create.channelId);
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
            var _a, _b, _c;
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
            const channelId = this.entityChannels.get(stored.nid);
            if (channelId !== undefined && ((_a = scopedCreateNidsByChannel.get(channelId)) === null || _a === void 0 ? void 0 : _a.has(stored.nid))) {
                (_b = channelFramesById.get(channelId)) === null || _b === void 0 ? void 0 : _b.ecsCreateComponents.push(cloneEntity(stored));
                (_c = channelFramesById.get(channelId)) === null || _c === void 0 ? void 0 : _c.createEntities.push(cloneEntity(stored));
            }
            changedNids.add(stored.nid);
        });
        snapshot.createEntities.forEach(entity => {
            var _a, _b;
            const stored = cloneEntity(entity);
            this.entities.set(stored.nid, stored);
            this.ntypes.set(stored.nid, stored.ntype);
            createEntities.push(cloneEntity(stored));
            const channelId = this.entityChannels.get(stored.nid);
            if (channelId !== undefined && ((_a = scopedCreateNidsByChannel.get(channelId)) === null || _a === void 0 ? void 0 : _a.has(stored.nid))) {
                (_b = channelFramesById.get(channelId)) === null || _b === void 0 ? void 0 : _b.createEntities.push(cloneEntity(stored));
            }
            changedNids.add(stored.nid);
        });
        channelEntityCreates.forEach(create => {
            this.channels.add(create.channelId);
            this.entityChannels.set(create.nid, create.channelId);
        });
        snapshot.updateEntities.forEach(update => {
            var _a, _b;
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
            const channelId = this.entityChannels.get(update.nid);
            if (channelId !== undefined && ((_a = scopedUpdateNidsByChannel.get(channelId)) === null || _a === void 0 ? void 0 : _a.has(update.nid))) {
                (_b = channelFramesById.get(channelId)) === null || _b === void 0 ? void 0 : _b.updateEntities.push({
                    nid: update.nid,
                    prop: update.prop,
                    previous,
                    value
                });
            }
            changedNids.add(update.nid);
        });
        deletedEntities.forEach(deleted => {
            var _a;
            const channelId = deleted.channelId;
            if (channelId !== undefined && ((_a = scopedDeleteNidsByChannel.get(channelId)) === null || _a === void 0 ? void 0 : _a.has(deleted.nid))) {
                const channelFrame = channelFramesById.get(channelId);
                if (channelFrame) {
                    channelFrame.deleteEntities.push(deleted.nid);
                    channelFrame.deletedEntities.push(deleted);
                }
            }
        });
        changedNids.forEach(nid => {
            const entity = this.entities.get(nid);
            if (entity) {
                this.history.recordState(tick, entity);
            }
        });
        const dedupedChannelEntityCreates = [];
        const seenChannelEntityCreates = new Set();
        channelEntityCreates.forEach(create => {
            const key = `${create.channelId}:${create.nid}`;
            if (seenChannelEntityCreates.has(key)) {
                return;
            }
            seenChannelEntityCreates.add(key);
            dedupedChannelEntityCreates.push(create);
        });
        return new Frame_1.Frame({
            tick,
            timestamp: snapshot.timestamp,
            receivedAt,
            confirmedClientTick: snapshot.confirmedClientTick,
            ecsCreateEntities,
            ecsCreateComponents,
            ecsDeleteEntities,
            channelOpens,
            channelEntityCreates: dedupedChannelEntityCreates,
            channelHeaderUpdates,
            channelCloses,
            skipInterpolationNids: (snapshot.skipInterpolationNids || []).slice(),
            openedChannels,
            closedChannels,
            createEntities,
            updateEntities,
            deleteEntities,
            deletedEntities,
            messages: snapshot.messages.slice(),
            interpolatedMessages: (snapshot.interpolatedMessages || []).slice(),
            channels: frameChannels
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
