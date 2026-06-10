"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplicaRouter = exports.ChannelRouteBuilder = exports.ClientEntityMode = void 0;
const FixedStepInterpolator_1 = require("./FixedStepInterpolator");
var ClientEntityMode;
(function (ClientEntityMode) {
    ClientEntityMode["Raw"] = "raw";
    ClientEntityMode["Interpolated"] = "interpolated";
    ClientEntityMode["Predicted"] = "predicted";
    ClientEntityMode["Ignored"] = "ignored";
})(ClientEntityMode || (exports.ClientEntityMode = ClientEntityMode = {}));
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
class ChannelRouteBuilder {
    constructor(route) {
        this.route = route;
    }
    onOpen(handler) {
        this.route.openHandlers.push(handler);
        return this;
    }
    onHeaderUpdate(handler) {
        this.route.headerUpdateHandlers.push(handler);
        return this;
    }
    onCreate(ntype, handler) {
        addHandler(this.route.createHandlers, ntype, handler);
        return this;
    }
    onUpdate(ntype, handler) {
        addHandler(this.route.updateHandlers, ntype, handler);
        return this;
    }
    onDelete(ntype, handler) {
        addHandler(this.route.deleteHandlers, ntype, handler);
        return this;
    }
    onClose(handler) {
        this.route.closeHandlers.push(handler);
        return this;
    }
}
exports.ChannelRouteBuilder = ChannelRouteBuilder;
class ReplicaRouter {
    constructor(client, options = {}) {
        var _a;
        this.tracked = new Map();
        this.lastBatch = emptyBatch();
        this.createHandlers = new Map();
        this.updateHandlers = new Map();
        this.deleteHandlers = new Map();
        this.messageHandlers = new Map();
        this.interpolatedMessageHandlers = new Map();
        this.channelRoutes = [];
        this.channelHeaderCreateHandlers = [];
        this.channelHeaderUpdateHandlers = [];
        this.channelHeaderDeleteHandlers = [];
        this.ecsCreateEntityHandlers = [];
        this.ecsCreateComponentHandlers = [];
        this.ecsDeleteEntityHandlers = [];
        this.anyCreateHandlers = [];
        this.anyUpdateHandlers = [];
        this.anyDeleteHandlers = [];
        this.anyMessageHandlers = [];
        this.anyInterpolatedMessageHandlers = [];
        this.interpolatedVisible = new Set();
        this.lastInterpolatedMessageTick = Number.NEGATIVE_INFINITY;
        this.client = client;
        this.interpolator = options.interpolator || (options.interpolatorOptions
            ? new FixedStepInterpolator_1.FixedStepInterpolator(client, options.interpolatorOptions)
            : new FixedStepInterpolator_1.StaticInterpolator(client));
        this.defaultMode = (_a = options.defaultMode) !== null && _a !== void 0 ? _a : null;
    }
    onCreate(ntype, handler) {
        addHandler(this.createHandlers, ntype, handler);
    }
    onCreateAny(handler) {
        this.anyCreateHandlers.push(handler);
    }
    channel(predicate) {
        const route = {
            predicate,
            openHandlers: [],
            headerUpdateHandlers: [],
            closeHandlers: [],
            createHandlers: new Map(),
            updateHandlers: new Map(),
            deleteHandlers: new Map()
        };
        this.channelRoutes.push(route);
        return new ChannelRouteBuilder(route);
    }
    onChannelHeaderCreate(handler) {
        this.channelHeaderCreateHandlers.push(handler);
    }
    onChannelHeaderUpdate(handler) {
        this.channelHeaderUpdateHandlers.push(handler);
    }
    onChannelHeaderDelete(handler) {
        this.channelHeaderDeleteHandlers.push(handler);
    }
    onEcsCreateEntity(handler) {
        this.ecsCreateEntityHandlers.push(handler);
    }
    onEcsCreateComponent(handler) {
        this.ecsCreateComponentHandlers.push(handler);
    }
    onEcsDeleteEntity(handler) {
        this.ecsDeleteEntityHandlers.push(handler);
    }
    onUpdate(ntype, handler) {
        addHandler(this.updateHandlers, ntype, handler);
    }
    onUpdateAny(handler) {
        this.anyUpdateHandlers.push(handler);
    }
    onDelete(ntype, handler) {
        addHandler(this.deleteHandlers, ntype, handler);
    }
    onDeleteAny(handler) {
        this.anyDeleteHandlers.push(handler);
    }
    onMessage(ntype, handler) {
        addHandler(this.messageHandlers, ntype, handler);
    }
    onMessageAny(handler) {
        this.anyMessageHandlers.push(handler);
    }
    onInterpolatedMessage(ntype, handler) {
        addHandler(this.interpolatedMessageHandlers, ntype, handler);
    }
    onInterpolatedMessageAny(handler) {
        this.anyInterpolatedMessageHandlers.push(handler);
    }
    process(options = {}) {
        return this.processServerFrames(options);
    }
    processServerFrames(options = {}) {
        var _a;
        const batch = emptyBatch();
        const maxFrames = (_a = options.maxFrames) !== null && _a !== void 0 ? _a : Number.POSITIVE_INFINITY;
        while (batch.frames.length < maxFrames) {
            const frame = this.client.network.processNextFrame();
            if (!frame) {
                break;
            }
            batch.frames.push(frame);
            frame.channelHeaderCreates.forEach(create => {
                this.processChannelHeaderCreate(frame, create.channelId, create.header);
            });
            frame.channelHeaderUpdates.forEach(update => {
                const header = this.client.network.store.getChannelHeader(update.channelId);
                update.changes.forEach(change => {
                    this.processChannelHeaderUpdate(frame, update.channelId, change, header);
                });
            });
            frame.closedChannels.forEach(closed => {
                this.processChannelClose(frame, closed, batch);
            });
            frame.ecsDeleteEntities.forEach(pid => {
                this.processEcsDeleteEntity(frame, pid, batch);
            });
            frame.deletedEntities.forEach(deleted => {
                this.processDelete(frame, deleted, batch);
            });
            frame.ecsCreateEntities.forEach(pid => {
                this.processEcsCreateEntity(frame, pid, batch);
            });
            frame.ecsCreateComponents.forEach(component => {
                this.processEcsCreateComponent(frame, component, batch);
            });
            frame.createEntities.forEach(entity => {
                this.processCreate(frame, entity, batch);
            });
            frame.updateEntities.forEach(update => {
                this.processUpdate(frame, update, batch);
            });
            frame.messages.forEach(message => {
                this.processMessage(frame, message, batch);
            });
        }
        this.lastBatch = batch;
        return batch;
    }
    track(nid, options = {}) {
        var _a, _b, _c, _d, _e, _f;
        const existing = this.tracked.get(nid);
        const entity = this.client.network.store.get(nid);
        const ntype = (_b = (_a = options.ntype) !== null && _a !== void 0 ? _a : existing === null || existing === void 0 ? void 0 : existing.ntype) !== null && _b !== void 0 ? _b : entity === null || entity === void 0 ? void 0 : entity.ntype;
        if (ntype === undefined) {
            throw new Error(`Cannot track nid ${nid} without an ntype.`);
        }
        const tracked = {
            nid,
            ntype,
            mode: (_d = (_c = options.mode) !== null && _c !== void 0 ? _c : existing === null || existing === void 0 ? void 0 : existing.mode) !== null && _d !== void 0 ? _d : ClientEntityMode.Raw,
            local: (_e = options.local) !== null && _e !== void 0 ? _e : existing === null || existing === void 0 ? void 0 : existing.local,
            meta: (_f = options.meta) !== null && _f !== void 0 ? _f : existing === null || existing === void 0 ? void 0 : existing.meta,
            deleted: false
        };
        this.tracked.set(nid, tracked);
        return tracked;
    }
    trackEntity(entity, options = {}) {
        return this.track(entity.nid, Object.assign(Object.assign({}, options), { ntype: entity.ntype }));
    }
    untrack(nid) {
        this.tracked.delete(nid);
        this.interpolatedVisible.delete(nid);
    }
    setMode(nid, mode) {
        const tracked = this.tracked.get(nid);
        if (!tracked) {
            this.track(nid, { mode });
            return;
        }
        tracked.mode = mode;
    }
    getRaw(nid) {
        return this.client.network.store.get(nid);
    }
    getChannelId(nid) {
        return this.client.network.store.getChannelId(nid);
    }
    getChannelHeader(channelOrEntityNid) {
        return this.client.network.store.getChannelHeader(channelOrEntityNid);
    }
    getLastConfirmedClientTick() {
        var _a, _b;
        return (_b = (_a = this.client.network.latestFrame) === null || _a === void 0 ? void 0 : _a.confirmedClientTick) !== null && _b !== void 0 ? _b : -1;
    }
    getRawTracked(mode) {
        const entities = [];
        this.tracked.forEach(tracked => {
            if (mode && tracked.mode !== mode) {
                return;
            }
            const entity = this.client.network.store.get(tracked.nid);
            if (entity) {
                entities.push({ entity, tracked: tracked });
            }
        });
        return entities;
    }
    getChangedRaw() {
        const entities = [];
        this.lastBatch.changedNids.forEach(nid => {
            const tracked = this.tracked.get(nid);
            const entity = this.client.network.store.get(nid);
            if (tracked && entity) {
                entities.push({ entity, tracked });
            }
        });
        return entities;
    }
    getChangedNids() {
        return Array.from(this.lastBatch.changedNids);
    }
    sampleInterpolated(interpDelay, now = Date.now()) {
        const interpolatedNids = [];
        this.tracked.forEach(tracked => {
            if (tracked.mode === ClientEntityMode.Interpolated) {
                interpolatedNids.push(tracked.nid);
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
        this.tracked.forEach(tracked => {
            if (tracked.mode !== ClientEntityMode.Interpolated) {
                return;
            }
            const entity = state.entities.get(tracked.nid);
            if (entity) {
                const routed = { entity, tracked: tracked };
                entities.push(routed);
                currentVisible.add(tracked.nid);
                if (!this.interpolatedVisible.has(tracked.nid)) {
                    entered.push(routed);
                }
            }
            else if (this.interpolatedVisible.has(tracked.nid)) {
                exited.push(tracked);
                if (tracked.deleted) {
                    this.tracked.delete(tracked.nid);
                }
            }
        });
        const messages = this.processInterpolatedMessages(state.targetFrameTick);
        this.interpolatedVisible = currentVisible;
        return { status: sample.status, sample, state, entities, entered, exited, messages };
    }
    processEcsCreateEntity(frame, pid, batch) {
        batch.ecsCreateEntities.push(pid);
        this.ecsCreateEntityHandlers.forEach(handler => handler(pid, frame));
    }
    processChannelHeaderCreate(frame, channelId, header) {
        this.channelHeaderCreateHandlers.forEach(handler => handler(header, frame, channelId));
        const ctx = { channelId, header };
        this.matchingChannelRoutes(ctx, frame).forEach(route => {
            route.openHandlers.forEach(handler => handler(ctx, frame));
        });
    }
    processChannelHeaderUpdate(frame, channelId, update, header) {
        this.channelHeaderUpdateHandlers.forEach(handler => handler(update, header, frame, channelId));
        const ctx = this.getChannelRouteContext(channelId, frame);
        if (!ctx) {
            return;
        }
        this.matchingChannelRoutes(ctx, frame).forEach(route => {
            route.headerUpdateHandlers.forEach(handler => handler(update, ctx, frame));
        });
    }
    processChannelClose(frame, closed, batch) {
        batch.closedChannels.push(closed);
        this.channelHeaderDeleteHandlers.forEach(handler => handler(closed.channelId, closed.header, frame));
        const ctx = { channelId: closed.channelId, header: closed.header, closed };
        this.matchingChannelRoutes(ctx, frame).forEach(route => {
            route.closeHandlers.forEach(handler => handler(ctx, frame));
        });
        for (let i = 0; i < closed.entityNids.length; i++) {
            this.untrack(closed.entityNids[i]);
            batch.deletedNids.add(closed.entityNids[i]);
            batch.changedNids.add(closed.entityNids[i]);
        }
    }
    processEcsCreateComponent(frame, component, batch) {
        batch.ecsCreateComponents.push(component);
        this.ecsCreateComponentHandlers.forEach(handler => handler(component, frame));
    }
    processEcsDeleteEntity(frame, pid, batch) {
        batch.ecsDeleteEntities.push(pid);
        this.ecsDeleteEntityHandlers.forEach(handler => handler(pid, frame));
    }
    processCreate(frame, entity, batch) {
        if (this.defaultMode !== null && !this.tracked.has(entity.nid)) {
            this.trackEntity(entity, { mode: this.defaultMode });
        }
        const tracked = this.tracked.get(entity.nid);
        if (tracked) {
            tracked.deleted = false;
            tracked.ntype = entity.ntype;
        }
        batch.createEntities.push(entity);
        batch.createdNids.add(entity.nid);
        batch.changedNids.add(entity.nid);
        const channelId = this.client.network.store.getChannelId(entity.nid);
        const channelContext = channelId === undefined ? undefined : this.getChannelRouteContext(channelId, frame);
        this.anyCreateHandlers.forEach(handler => handler(entity, tracked, frame));
        const handlers = this.createHandlers.get(entity.ntype) || [];
        handlers.forEach(handler => handler(entity, tracked, frame));
        if (channelContext) {
            this.matchingChannelRoutes(channelContext, frame).forEach(route => {
                const channelHandlers = route.createHandlers.get(entity.ntype) || [];
                channelHandlers.forEach(handler => handler(entity, tracked, channelContext, frame));
            });
        }
    }
    processUpdate(frame, update, batch) {
        var _a;
        const entity = this.client.network.store.get(update.nid);
        const tracked = this.tracked.get(update.nid);
        const channelId = this.client.network.store.getChannelId(update.nid);
        const channelContext = channelId === undefined ? undefined : this.getChannelRouteContext(channelId, frame);
        batch.updateEntities.push(update);
        batch.updatedNids.add(update.nid);
        batch.changedNids.add(update.nid);
        const ntype = (_a = entity === null || entity === void 0 ? void 0 : entity.ntype) !== null && _a !== void 0 ? _a : tracked === null || tracked === void 0 ? void 0 : tracked.ntype;
        this.anyUpdateHandlers.forEach(handler => handler(update, entity, tracked, frame));
        if (ntype !== undefined) {
            const handlers = this.updateHandlers.get(ntype) || [];
            handlers.forEach(handler => handler(update, entity, tracked, frame));
            if (channelContext) {
                this.matchingChannelRoutes(channelContext, frame).forEach(route => {
                    const channelHandlers = route.updateHandlers.get(ntype) || [];
                    channelHandlers.forEach(handler => handler(update, entity, tracked, channelContext, frame));
                });
            }
        }
    }
    processDelete(frame, deleted, batch) {
        var _a, _b;
        const tracked = this.tracked.get(deleted.nid);
        const ntype = (_b = (_a = deleted.entity) === null || _a === void 0 ? void 0 : _a.ntype) !== null && _b !== void 0 ? _b : tracked === null || tracked === void 0 ? void 0 : tracked.ntype;
        if (tracked) {
            tracked.deleted = true;
            if (tracked.mode !== ClientEntityMode.Interpolated) {
                this.tracked.delete(deleted.nid);
                this.interpolatedVisible.delete(deleted.nid);
            }
        }
        batch.deleteEntities.push(deleted.nid);
        batch.deletedEntities.push(deleted);
        batch.deletedNids.add(deleted.nid);
        batch.changedNids.add(deleted.nid);
        this.anyDeleteHandlers.forEach(handler => handler(deleted.nid, deleted, tracked, frame));
        if (ntype !== undefined) {
            const handlers = this.deleteHandlers.get(ntype) || [];
            handlers.forEach(handler => handler(deleted.nid, deleted, tracked, frame));
            if (deleted.channelId !== undefined) {
                const channelContext = this.getChannelRouteContext(deleted.channelId, frame);
                if (channelContext) {
                    this.matchingChannelRoutes(channelContext, frame).forEach(route => {
                        const channelHandlers = route.deleteHandlers.get(ntype) || [];
                        channelHandlers.forEach(handler => handler(deleted.nid, deleted, tracked, channelContext, frame));
                    });
                }
            }
        }
    }
    processMessage(frame, message, batch) {
        batch.messages.push(message);
        this.anyMessageHandlers.forEach(handler => handler(message, frame));
        const handlers = this.messageHandlers.get(message.ntype) || [];
        handlers.forEach(handler => handler(message, frame));
    }
    processInterpolatedMessages(targetFrameTick) {
        const messages = [];
        const frames = this.client.network.frames;
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (frame.tick <= this.lastInterpolatedMessageTick || frame.tick > targetFrameTick) {
                continue;
            }
            for (let j = 0; j < frame.messages.length; j++) {
                const message = frame.messages[j];
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
    getChannelRouteContext(channelId, frame) {
        var _a;
        const header = this.client.network.store.getChannelHeader(channelId) ||
            ((_a = frame.channelHeaderDeletes.find(deleted => deleted.channelId === channelId)) === null || _a === void 0 ? void 0 : _a.header);
        if (!header) {
            return undefined;
        }
        return { channelId, header };
    }
    matchingChannelRoutes(ctx, frame) {
        const routes = [];
        for (let i = 0; i < this.channelRoutes.length; i++) {
            const route = this.channelRoutes[i];
            if (route.predicate(ctx, frame)) {
                routes.push(route);
            }
        }
        return routes;
    }
}
exports.ReplicaRouter = ReplicaRouter;
