"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpatialChannel2D = void 0;
const Channel_1 = require("./Channel");
const SpatialGrid_1 = require("./SpatialGrid");
const SpatialView_1 = require("./SpatialView");
// SpatialChannel2D intentionally mirrors SpatialChannel3D instead of using a
// dimension-generic wrapper; this is snapshot hot-path code, so benchmark
// before collapsing the parallel implementations.
class SpatialChannel2D {
    constructor(localState, cellSize, options = {}) {
        this.cellFragmentMode = true;
        this.views = new Map();
        this.viewVersions = new Map();
        this.visibleCellKeyCache = new Map();
        this.visibleEntityCache = new Map();
        this.visibleNetworkedNidsCache = new Map();
        this.rememberedCells = new Map();
        this.rememberedCellSignatures = new Map();
        this.movedRoots = [];
        this.structuralDeltas = false;
        this.membershipVersion = 0;
        this.users = new Map();
        this.visibilityResolver = (obj, view) => (0, SpatialView_1.objectInSpatialView)(obj, view, this.plane);
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('SpatialChannel2D requires a positive finite cell size.');
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('SpatialChannel2D queryPadding must be a non-negative finite number.');
        }
        this.localState = localState;
        this.channel = new Channel_1.Channel(localState, options);
        localState.channels.delete(this.channel);
        localState.channels.add(this);
        this.cellSize = cellSize;
        this.queryPadding = options.queryPadding || 0;
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16));
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64));
        this.plane = options.plane || 'xy';
        this.axes = (0, SpatialView_1.getSpatialPlaneAxes)(this.plane);
        this.grid = new SpatialGrid_1.SpatialGrid2D({
            cellSize,
            getX: entity => entity[this.axes.a],
            getY: entity => entity[this.axes.b]
        });
    }
    get nid() {
        return this.channel.nid;
    }
    get label() {
        return this.channel.label;
    }
    get header() {
        return this.channel.header;
    }
    get headerVersion() {
        return this.channel.headerVersion;
    }
    get entities() {
        return this.channel.entities;
    }
    setHeader(header) {
        return this.channel.setHeader(header);
    }
    getHeader() {
        return this.channel.getHeader();
    }
    markHeaderDirty() {
        return this.channel.markHeaderDirty();
    }
    invalidateVisibleEntityCache() {
        this.visibleEntityCache.clear();
        this.visibleNetworkedNidsCache.clear();
    }
    invalidateVisibleCellKeyCache() {
        this.visibleCellKeyCache.clear();
        this.invalidateVisibleEntityCache();
    }
    viewRange(view) {
        const spatialView = (0, SpatialView_1.normalizeSpatialView)(view, this.plane);
        const halfWidth = spatialView.halfA + this.queryPadding;
        const halfHeight = spatialView.halfB + this.queryPadding;
        const startX = spatialView.a - halfWidth;
        const startY = spatialView.b - halfHeight;
        const endX = spatialView.a + halfWidth;
        const endY = spatialView.b + halfHeight;
        return {
            minX: this.grid.cellCoord(startX),
            maxX: this.grid.cellCoordForEnd(endX),
            minY: this.grid.cellCoord(startY),
            maxY: this.grid.cellCoordForEnd(endY)
        };
    }
    buildVisibleCellKeys(userId) {
        const view = this.views.get(userId);
        if (!view) {
            return [];
        }
        const spatialView = (0, SpatialView_1.normalizeSpatialView)(view, this.plane);
        if (spatialView.radius !== undefined) {
            return this.grid.getVisibleCellKeysInCircle(spatialView.a, spatialView.b, spatialView.radius + this.queryPadding);
        }
        return this.grid.getVisibleCellKeys(this.viewRange(view));
    }
    buildVisibleEntities(userId) {
        const keys = this.getVisibleCellKeys(userId);
        const nids = [];
        for (let i = 0; i < keys.length; i++) {
            const cell = this.grid.cells.get(keys[i]);
            if (!cell) {
                continue;
            }
            for (let j = 0; j < cell.ids.length; j++) {
                nids.push(cell.ids[j]);
            }
        }
        return nids;
    }
    getCellDeleteNids(key) {
        const nids = [];
        const cell = this.grid.cells.get(key);
        if (!cell) {
            return nids;
        }
        for (let i = 0; i < cell.ids.length; i++) {
            this.localState.collectEntityTreeDeletes(cell.ids[i], nids);
        }
        return nids;
    }
    tick(tick) {
        this.channel.tick(tick);
    }
    addEntity(entity) {
        this.channel.addEntity(entity);
        this.grid.add(entity.nid, entity);
        this.membershipVersion++;
        this.structuralDeltas = true;
        this.invalidateVisibleCellKeyCache();
        return entity;
    }
    updateEntity(entity) {
        const move = this.grid.update(entity.nid, entity);
        if (!move) {
            return;
        }
        this.movedRoots.push({ entity, fromCell: move.fromCell, toCell: move.toCell });
        this.membershipVersion++;
        if (move.removedCell || move.createdCell) {
            this.invalidateVisibleCellKeyCache();
        }
        else {
            this.invalidateVisibleEntityCache();
        }
    }
    removeEntity(entity) {
        const removedNid = this.channel.removeEntity(entity);
        if (removedNid === 0) {
            return 0;
        }
        const removed = this.grid.remove(removedNid);
        this.membershipVersion++;
        this.structuralDeltas = true;
        if (removed === null || removed === void 0 ? void 0 : removed.removedCell) {
            this.invalidateVisibleCellKeyCache();
        }
        else {
            this.invalidateVisibleEntityCache();
        }
        return removedNid;
    }
    removeAllEntities() {
        Array.from(this.channel.entities.array).forEach(entity => this.removeEntity(entity));
    }
    markDirty(entity) {
        return this.localState.markDirty(entity);
    }
    getDirtyCellKeys() {
        const keys = new Set();
        for (const nid of this.localState.dirtyNids) {
            const ref = this.grid.objectCells.get(nid);
            if (ref) {
                keys.add(ref.key);
            }
        }
        return Array.from(keys);
    }
    addMessage(message) {
        // Spatial messages are culled immediately against the current user
        // views instead of being stored as channel broadcast fragments.
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId);
            if (view && this.visibilityResolver(message, view)) {
                user.queueMessage(message);
            }
        });
    }
    clearBroadcastMessages() {
    }
    clearSnapshotDeltas() {
        this.channel.clearSnapshotDeltas();
        this.movedRoots.length = 0;
        this.structuralDeltas = false;
    }
    subscribe(user, view) {
        this.views.set(user.id, view);
        this.viewVersions.set(user.id, 1);
        this.users.set(user.id, user);
        user.subscribe(this);
    }
    updateView(user, view) {
        if (!this.users.has(user.id)) {
            return;
        }
        this.views.set(user.id, view);
        this.viewVersions.set(user.id, (this.viewVersions.get(user.id) || 0) + 1);
        this.visibleCellKeyCache.delete(user.id);
        this.visibleEntityCache.delete(user.id);
        this.visibleNetworkedNidsCache.delete(user.id);
    }
    unsubscribe(user) {
        this.views.delete(user.id);
        this.viewVersions.delete(user.id);
        this.visibleCellKeyCache.delete(user.id);
        this.visibleEntityCache.delete(user.id);
        this.visibleNetworkedNidsCache.delete(user.id);
        this.rememberedCells.delete(user.id);
        this.rememberedCellSignatures.delete(user.id);
        this.users.delete(user.id);
        user.unsubscribe(this);
    }
    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user));
    }
    getVisibleCellKeys(userId) {
        const viewVersion = this.viewVersions.get(userId) || 0;
        const cached = this.visibleCellKeyCache.get(userId);
        if (cached && cached.viewVersion === viewVersion) {
            return cached.keys;
        }
        const keys = this.buildVisibleCellKeys(userId);
        this.visibleCellKeyCache.set(userId, {
            viewVersion,
            keys
        });
        return keys;
    }
    getVisibleEntities(userId) {
        const viewVersion = this.viewVersions.get(userId) || 0;
        const cached = this.visibleEntityCache.get(userId);
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.nids;
        }
        const nids = this.buildVisibleEntities(userId);
        this.visibleEntityCache.set(userId, {
            viewVersion,
            membershipVersion: this.membershipVersion,
            nids
        });
        return nids;
    }
    getVisibleNetworkedNids(userId) {
        const entityTreeVersion = this.localState.entityTreeVersion;
        const roots = this.getVisibleEntities(userId);
        if (entityTreeVersion === 0) {
            return roots;
        }
        const viewVersion = this.viewVersions.get(userId) || 0;
        const cached = this.visibleNetworkedNidsCache.get(userId);
        if (cached &&
            cached.viewVersion === viewVersion &&
            cached.membershipVersion === this.membershipVersion &&
            cached.entityTreeVersion === entityTreeVersion) {
            return cached.nids;
        }
        const nids = [];
        for (let i = 0; i < roots.length; i++) {
            this.localState.collectEntityTree(roots[i], nids);
        }
        this.visibleNetworkedNidsCache.set(userId, {
            viewVersion,
            membershipVersion: this.membershipVersion,
            entityTreeVersion,
            nids
        });
        return nids;
    }
    getCellEntities(key) {
        var _a;
        return ((_a = this.grid.cells.get(key)) === null || _a === void 0 ? void 0 : _a.objects) || [];
    }
    getCellEntityNids(key) {
        var _a;
        return ((_a = this.grid.cells.get(key)) === null || _a === void 0 ? void 0 : _a.ids) || [];
    }
    getCellVersion(key) {
        var _a;
        return ((_a = this.grid.cells.get(key)) === null || _a === void 0 ? void 0 : _a.version) || 0;
    }
    getMovedRoots() {
        return this.movedRoots;
    }
    hasStructuralDeltas() {
        return this.structuralDeltas;
    }
    getVisibleCellVersionSignature(userId) {
        const keys = this.getVisibleCellKeys(userId);
        let signature = '';
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            signature += `${key}:${this.getCellVersion(key)}|`;
        }
        return signature;
    }
    getRememberedCellKeys(userId) {
        var _a;
        return Array.from(((_a = this.rememberedCells.get(userId)) === null || _a === void 0 ? void 0 : _a.keys()) || []);
    }
    getRememberedCellNids(userId, key) {
        var _a;
        return ((_a = this.rememberedCells.get(userId)) === null || _a === void 0 ? void 0 : _a.get(key)) || [];
    }
    getStableVisibleCellKeys(userId) {
        const remembered = this.rememberedCells.get(userId);
        if (!remembered) {
            return null;
        }
        const keys = this.getVisibleCellKeys(userId);
        if (this.rememberedCellSignatures.get(userId) !== this.getVisibleCellVersionSignature(userId)) {
            return null;
        }
        if (remembered.size !== keys.length) {
            return null;
        }
        for (let i = 0; i < keys.length; i++) {
            if (!remembered.has(keys[i])) {
                return null;
            }
        }
        return keys;
    }
    rememberVisibleCells(userId) {
        const remembered = new Map();
        const keys = this.getVisibleCellKeys(userId);
        for (let i = 0; i < keys.length; i++) {
            remembered.set(keys[i], this.getCellDeleteNids(keys[i]));
        }
        this.rememberedCells.set(userId, remembered);
        this.rememberedCellSignatures.set(userId, this.getVisibleCellVersionSignature(userId));
    }
    destroy() {
        this.unsubscribeAll();
        this.localState.channels.delete(this);
        this.channel.destroy();
        this.views.clear();
        this.viewVersions.clear();
        this.visibleCellKeyCache.clear();
        this.visibleEntityCache.clear();
        this.visibleNetworkedNidsCache.clear();
        this.rememberedCells.clear();
        this.rememberedCellSignatures.clear();
        this.grid.cells.clear();
        this.grid.objectCells.clear();
        this.visibilityResolver = () => true;
    }
}
exports.SpatialChannel2D = SpatialChannel2D;
