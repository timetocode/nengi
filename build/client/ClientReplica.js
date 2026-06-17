"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientReplica = void 0;
const ClientEntityMode_1 = require("./ClientEntityMode");
const FixedStepInterpolator_1 = require("./FixedStepInterpolator");
function emptyBatch(frames = []) {
    return {
        frames,
        closedChannels: [],
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: [],
        deletedEntities: [],
        messages: [],
        createdNids: new Set(),
        updatedNids: new Set(),
        deletedNids: new Set(),
        changedNids: new Set()
    };
}
function addHandler(handlers, ntype, handler) {
    const arr = handlers.get(ntype) || [];
    arr.push(handler);
    handlers.set(ntype, arr);
}
class ClientReplica {
    constructor(client, options = {}) {
        this.channels = new Map();
        this.entities = new Map();
        this.lastBatch = emptyBatch();
        this.entityBindings = new Map();
        this.ecsComponentBindings = new Map();
        this.entityBindingsByNid = new Map();
        this.channelBindings = new Map();
        this.channelEntityBindings = [];
        this.ecsCreateEntityHandlers = [];
        this.ecsDeleteEntityHandlers = [];
        this.messageHandlers = new Map();
        this.anyMessageHandlers = [];
        this.interpolatedMessageHandlers = new Map();
        this.anyInterpolatedMessageHandlers = [];
        this.interpolatedVisible = new Set();
        this.lastInterpolatedMessageTick = Number.NEGATIVE_INFINITY;
        this.client = client;
        this.interpolator = options.interpolator || (options.interpolatorOptions
            ? new FixedStepInterpolator_1.FixedStepInterpolator(client, options.interpolatorOptions)
            : new FixedStepInterpolator_1.StaticInterpolator(client));
    }
    bindEntity(ntype, binding) {
        this.entityBindings.set(ntype, binding);
        return this;
    }
    bindEcsComponent(ntype, binding) {
        this.ecsComponentBindings.set(ntype, binding);
        return this;
    }
    onEcsCreateEntity(handler) {
        this.ecsCreateEntityHandlers.push(handler);
        return this;
    }
    onEcsDeleteEntity(handler) {
        this.ecsDeleteEntityHandlers.push(handler);
        return this;
    }
    bindChannel(headerNtype, binding) {
        this.channelBindings.set(headerNtype, binding);
        return this;
    }
    bindChannelEntity(headerNtype, entityNtype, binding) {
        this.channelEntityBindings.push({
            headerNtype,
            entityNtype,
            binding: binding
        });
        return this;
    }
    onMessage(ntype, handler) {
        addHandler(this.messageHandlers, ntype, handler);
        return this;
    }
    onMessageAny(handler) {
        this.anyMessageHandlers.push(handler);
        return this;
    }
    onInterpolatedMessage(ntype, handler) {
        addHandler(this.interpolatedMessageHandlers, ntype, handler);
        return this;
    }
    onInterpolatedMessageAny(handler) {
        this.anyInterpolatedMessageHandlers.push(handler);
        return this;
    }
    process(options = {}) {
        var _a;
        const batch = emptyBatch();
        const maxFrames = (_a = options.maxFrames) !== null && _a !== void 0 ? _a : Number.POSITIVE_INFINITY;
        while (batch.frames.length < maxFrames) {
            const frame = this.client.network.processNextFrame();
            if (!frame) {
                break;
            }
            batch.frames.push(frame);
            this.processChannelOpens(frame);
            this.processChannelHeaderUpdates(frame);
            this.processChannelCloses(frame, batch);
            this.processDeletes(frame, batch);
            this.processEcsDeleteEntities(frame, batch);
            this.processEcsCreateEntities(frame, batch);
            this.processEcsCreateComponents(frame, batch);
            this.processCreates(frame, batch);
            this.processUpdates(frame, batch);
            this.processMessages(frame, batch);
        }
        this.lastBatch = batch;
        return batch;
    }
    setMode(nid, mode) {
        const ref = this.entities.get(nid);
        if (!ref) {
            return false;
        }
        ref.mode = mode;
        if (mode !== ClientEntityMode_1.ClientEntityMode.Interpolated) {
            this.interpolatedVisible.delete(nid);
        }
        return true;
    }
    getEntity(nid) {
        return this.client.network.store.get(nid);
    }
    getLastConfirmedClientTick() {
        var _a, _b;
        return (_b = (_a = this.client.network.latestFrame) === null || _a === void 0 ? void 0 : _a.confirmedClientTick) !== null && _b !== void 0 ? _b : -1;
    }
    getChangedNids() {
        return Array.from(this.lastBatch.changedNids);
    }
    sampleInterpolated(interpDelay, now = Date.now()) {
        const interpolatedNids = [];
        this.entities.forEach(ref => {
            if (ref.mode === ClientEntityMode_1.ClientEntityMode.Interpolated) {
                interpolatedNids.push(ref.nid);
            }
        });
        const sample = this.interpolator.sampleEntities(interpolatedNids, interpDelay, now);
        const state = sample.status === FixedStepInterpolator_1.InterpolationStatus.Ok ? sample : null;
        if (!state) {
            return {
                status: sample.status,
                sample,
                state: null,
                entities: [],
                entered: [],
                exited: [],
                messages: []
            };
        }
        const currentVisible = new Set();
        const entities = [];
        const entered = [];
        const exited = [];
        this.entities.forEach(ref => {
            if (ref.mode !== ClientEntityMode_1.ClientEntityMode.Interpolated) {
                return;
            }
            const entity = state.entities.get(ref.nid);
            if (entity) {
                const routed = this.routedEntity(entity, ref);
                entities.push(routed);
                currentVisible.add(ref.nid);
                if (!this.interpolatedVisible.has(ref.nid)) {
                    entered.push(routed);
                }
            }
            else if (this.interpolatedVisible.has(ref.nid)) {
                exited.push(ref);
                if (ref.deleted) {
                    this.untrack(ref.nid);
                }
            }
        });
        const messages = this.processInterpolatedMessages(state.targetFrameTick);
        this.interpolatedVisible = currentVisible;
        return { status: sample.status, sample, state, entities, entered, exited, messages };
    }
    applyInterpolatedSample(sample) {
        let applied = 0;
        let destroyed = 0;
        const entities = sample.state
            ? sample.entities
            : this.getTrackedByMode(ClientEntityMode_1.ClientEntityMode.Interpolated);
        entities.forEach(({ entity, replica }) => {
            const binding = this.entityBindingsByNid.get(replica.nid);
            if (!(binding === null || binding === void 0 ? void 0 : binding.sample)) {
                return;
            }
            binding.sample(entity, replica.local, this.createContext(replica, {
                sample,
                state: sample.state
            }));
            applied++;
        });
        sample.exited.forEach(ref => {
            if (this.destroyBinding(ref, {
                sample,
                state: sample.state
            })) {
                destroyed++;
            }
        });
        return { applied, destroyed };
    }
    processChannelOpens(frame) {
        frame.openedChannels.forEach(opened => {
            const channel = this.ensureChannel(opened.channelId);
            channel.open = true;
            channel.header = opened.header;
            this.invokeChannelOpen(channel, frame);
        });
    }
    processChannelHeaderUpdates(frame) {
        frame.channelHeaderUpdates.forEach(update => {
            const header = this.client.network.store.getChannelHeaderById(update.channelId);
            const channel = this.ensureChannel(update.channelId);
            channel.header = header;
            const binding = this.channelBindings.get(channel.header.ntype);
            if (!(binding === null || binding === void 0 ? void 0 : binding.update)) {
                return;
            }
            update.changes.forEach(change => binding.update(channel, change, frame));
        });
    }
    processChannelCloses(frame, batch) {
        frame.closedChannels.forEach(closed => {
            var _a;
            const channel = this.ensureChannel(closed.channelId);
            channel.header = closed.header;
            batch.closedChannels.push(closed);
            const binding = this.channelBindings.get(channel.header.ntype);
            (_a = binding === null || binding === void 0 ? void 0 : binding.close) === null || _a === void 0 ? void 0 : _a.call(binding, channel, frame);
            for (let i = 0; i < closed.entityNids.length; i++) {
                const nid = closed.entityNids[i];
                this.destroyBinding(this.entities.get(nid), {
                    frame,
                    closedChannel: closed,
                    force: true
                });
                this.untrack(nid);
                batch.deletedNids.add(nid);
                batch.changedNids.add(nid);
            }
            channel.open = false;
            this.channels.delete(closed.channelId);
        });
    }
    processCreates(frame, batch) {
        for (let i = 0; i < frame.createEntities.length; i++) {
            const entity = frame.createEntities[i];
            batch.createEntities.push(entity);
            batch.createdNids.add(entity.nid);
            batch.changedNids.add(entity.nid);
            this.applyCreate(frame, entity);
        }
    }
    processEcsCreateEntities(frame, batch) {
        frame.ecsCreateEntities.forEach(pid => {
            batch.ecsCreateEntities.push(pid);
            this.ecsCreateEntityHandlers.forEach(handler => handler(pid, frame));
        });
    }
    processEcsCreateComponents(frame, batch) {
        frame.ecsCreateComponents.forEach(component => {
            batch.ecsCreateComponents.push(component);
        });
    }
    processEcsDeleteEntities(frame, batch) {
        frame.ecsDeleteEntities.forEach(pid => {
            batch.ecsDeleteEntities.push(pid);
            this.ecsDeleteEntityHandlers.forEach(handler => handler(pid, frame));
        });
    }
    processUpdates(frame, batch) {
        frame.updateEntities.forEach(update => {
            var _a;
            const entity = this.client.network.store.get(update.nid);
            const ref = this.entities.get(update.nid);
            batch.updateEntities.push(update);
            batch.updatedNids.add(update.nid);
            batch.changedNids.add(update.nid);
            if (!entity || !ref) {
                return;
            }
            const binding = this.entityBindingsByNid.get(update.nid);
            (_a = binding === null || binding === void 0 ? void 0 : binding.update) === null || _a === void 0 ? void 0 : _a.call(binding, entity, ref.local, this.createContext(ref, {
                frame,
                update
            }));
        });
    }
    processDeletes(frame, batch) {
        frame.deletedEntities.forEach(deleted => {
            const ref = this.entities.get(deleted.nid);
            if (ref) {
                ref.deleted = true;
                this.destroyBinding(ref, {
                    frame,
                    deleted
                });
                if (ref.mode !== ClientEntityMode_1.ClientEntityMode.Interpolated) {
                    this.untrack(deleted.nid);
                }
            }
            batch.deleteEntities.push(deleted.nid);
            batch.deletedEntities.push(deleted);
            batch.deletedNids.add(deleted.nid);
            batch.changedNids.add(deleted.nid);
        });
    }
    processMessages(frame, batch) {
        frame.messages.forEach(message => {
            batch.messages.push(message);
            this.anyMessageHandlers.forEach(handler => handler(message, frame));
            const handlers = this.messageHandlers.get(message.ntype) || [];
            handlers.forEach(handler => handler(message, frame));
        });
    }
    applyCreate(frame, entity) {
        var _a;
        const channel = this.getEntityChannel(entity.nid);
        const pid = this.getEcsComponentPid(entity);
        const binding = (pid === undefined ? undefined : this.ecsComponentBindings.get(entity.ntype)) || this.resolveBinding(entity.ntype, channel);
        if (!binding) {
            return;
        }
        const ref = {
            nid: entity.nid,
            ntype: entity.ntype,
            mode: (_a = binding.mode) !== null && _a !== void 0 ? _a : ClientEntityMode_1.ClientEntityMode.Raw,
            local: undefined,
            channel,
            deleted: false
        };
        const ctx = this.createContext(ref, { frame, pid });
        ref.local = binding.create(entity, ctx);
        this.entities.set(entity.nid, ref);
        this.entityBindingsByNid.set(entity.nid, binding);
    }
    invokeChannelOpen(channel, frame) {
        var _a;
        const binding = this.channelBindings.get(channel.header.ntype);
        (_a = binding === null || binding === void 0 ? void 0 : binding.open) === null || _a === void 0 ? void 0 : _a.call(binding, channel, frame);
    }
    resolveBinding(ntype, channel) {
        if (channel) {
            for (let i = 0; i < this.channelEntityBindings.length; i++) {
                const candidate = this.channelEntityBindings[i];
                if (candidate.headerNtype === channel.header.ntype && candidate.entityNtype === ntype) {
                    return candidate.binding;
                }
            }
        }
        return this.entityBindings.get(ntype);
    }
    routedEntity(entity, ref) {
        ref.channel = this.getEntityChannel(ref.nid);
        return {
            entity,
            replica: ref,
            channel: ref.channel
        };
    }
    getTrackedByMode(mode) {
        const entities = [];
        this.entities.forEach(ref => {
            if (ref.mode !== mode) {
                return;
            }
            const entity = this.client.network.store.get(ref.nid);
            if (entity) {
                entities.push(this.routedEntity(entity, ref));
            }
        });
        return entities;
    }
    createContext(ref, options = {}) {
        var _a, _b, _c, _d, _e, _f;
        ref.channel = this.getEntityChannel(ref.nid) || ref.channel;
        const pid = (_e = (_b = (_a = options.pid) !== null && _a !== void 0 ? _a : this.client.network.store.ecsComponentParent.get(ref.nid)) !== null && _b !== void 0 ? _b : (_d = (_c = options.deleted) === null || _c === void 0 ? void 0 : _c.entity) === null || _d === void 0 ? void 0 : _d.pid) !== null && _e !== void 0 ? _e : (_f = ref.local) === null || _f === void 0 ? void 0 : _f.pid;
        return {
            replica: this,
            ref,
            nid: ref.nid,
            pid,
            frame: options.frame,
            channel: ref.channel,
            update: options.update,
            deleted: options.deleted,
            closedChannel: options.closedChannel,
            sample: options.sample,
            state: options.state
        };
    }
    destroyBinding(ref, options = {}) {
        if (!ref) {
            return false;
        }
        if (!options.force && ref.mode === ClientEntityMode_1.ClientEntityMode.Interpolated && !options.sample) {
            return false;
        }
        const binding = this.entityBindingsByNid.get(ref.nid);
        if (!(binding === null || binding === void 0 ? void 0 : binding.destroy)) {
            return false;
        }
        binding.destroy(ref.local, this.createContext(ref, options));
        this.entityBindingsByNid.delete(ref.nid);
        return true;
    }
    untrack(nid) {
        this.entities.delete(nid);
        this.entityBindingsByNid.delete(nid);
        this.interpolatedVisible.delete(nid);
    }
    getEntityChannel(nid) {
        const channelId = this.client.network.store.getEntityChannelId(nid);
        return channelId === undefined ? null : this.ensureChannel(channelId);
    }
    getEcsComponentPid(entity) {
        var _a;
        return (_a = this.client.network.store.ecsComponentParent.get(entity.nid)) !== null && _a !== void 0 ? _a : entity.pid;
    }
    ensureChannel(channelId) {
        let channel = this.channels.get(channelId);
        if (!channel) {
            const header = this.client.network.store.getChannelHeaderById(channelId);
            if (!header) {
                throw new Error(`Cannot create client channel ${channelId} without a channel header.`);
            }
            channel = {
                id: channelId,
                open: this.client.network.store.channels.has(channelId),
                header
            };
            this.channels.set(channelId, channel);
        }
        const header = this.client.network.store.getChannelHeaderById(channelId);
        channel.header = header || channel.header;
        return channel;
    }
    processInterpolatedMessages(targetFrameTick) {
        const messages = [];
        const frames = this.client.network.frames;
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (frame.tick <= this.lastInterpolatedMessageTick || frame.tick > targetFrameTick) {
                continue;
            }
            for (let j = 0; j < frame.interpolatedMessages.length; j++) {
                const message = frame.interpolatedMessages[j];
                messages.push(message);
                this.anyInterpolatedMessageHandlers.forEach(handler => handler(message, frame));
                const handlers = this.interpolatedMessageHandlers.get(message.ntype) || [];
                handlers.forEach(handler => handler(message, frame));
            }
        }
        if (Number.isFinite(targetFrameTick)) {
            this.lastInterpolatedMessageTick = Math.max(this.lastInterpolatedMessageTick, targetFrameTick);
        }
        return messages;
    }
}
exports.ClientReplica = ClientReplica;
