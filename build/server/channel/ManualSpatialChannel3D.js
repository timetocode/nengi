"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualSpatialChannel3D = void 0;
const ChannelHeader_1 = require("../../common/ChannelHeader");
const NDictionary_1 = require("../NDictionary");
const SpatialGrid_1 = require("./SpatialGrid");
const SpatialView_1 = require("./SpatialView");
function initializeManualSpatialCell(cell) {
    const manualCell = cell;
    manualCell.manualPropNids = [];
    manualCell.manualPropSchemas = [];
    manualCell.manualPropValues = [];
    manualCell.manualGroupNids = [];
    manualCell.manualGroupSchemas = [];
    manualCell.manualGroupValueOffsets = [];
    manualCell.manualGroupValues = [];
}
// ManualSpatialChannel3D intentionally mirrors ManualSpatialChannel2D instead
// of using a dimension-generic wrapper; this is snapshot hot-path code, so
// benchmark before collapsing the parallel implementations.
class ManualSpatialChannel3D {
    constructor(localState, cellSize, options = {}) {
        var _a, _b, _c;
        this.manualSpatialChannelMode = true;
        this.cellFragmentMode = true;
        this.entities = new NDictionary_1.NDictionary();
        this.users = new Map();
        this.headerVersion = 0;
        this.channelType = ChannelHeader_1.ChannelType.ManualSpatialChannel3D;
        this.visibilityResolver = SpatialView_1.objectInSpatialView3D;
        this.membershipVersion = 0;
        this.dirtyCells = new Set();
        this.views = new Map();
        this.viewVersions = new Map();
        this.visibleCellKeyCache = new Map();
        this.visibleEntityCache = new Map();
        this.visibleNetworkedNidsCache = new Map();
        this.rememberedCells = new Map();
        this.rememberedCellSignatures = new Map();
        this.movedRoots = [];
        this.structuralDeltas = false;
        this.skipInterpolationNids = [];
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('ManualSpatialChannel3D requires a positive finite cell size.');
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('ManualSpatialChannel3D queryPadding must be a non-negative finite number.');
        }
        this.localState = localState;
        this.nid = localState.nextNetworkId();
        this.header = (0, ChannelHeader_1.createChannelHeader)(this.nid, this.channelType, options.header, options.name);
        this.headerVersion = (0, ChannelHeader_1.hasSchemaBackedChannelHeader)(this.header) ? 1 : 0;
        this.cellSize = cellSize;
        this.queryPadding = options.queryPadding || 0;
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16));
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64));
        this.spatialXProp = ((_a = options.spatialProps) === null || _a === void 0 ? void 0 : _a.x) || 'x';
        this.spatialYProp = ((_b = options.spatialProps) === null || _b === void 0 ? void 0 : _b.y) || 'y';
        this.spatialZProp = ((_c = options.spatialProps) === null || _c === void 0 ? void 0 : _c.z) || 'z';
        this.strictManualWrites = options.strictManualWrites === true;
        this.grid = new SpatialGrid_1.SpatialGrid3D({
            cellSize,
            getX: entity => entity[this.spatialXProp],
            getY: entity => entity[this.spatialYProp],
            getZ: entity => entity[this.spatialZProp],
            initializeCell: initializeManualSpatialCell
        });
        this.localState.channels.add(this);
    }
    getOrCreateCellForEntity(entity) {
        return this.grid.getOrCreateCellForObject(entity);
    }
    getCellForEntity(entity) {
        const ref = this.grid.objectCells.get(entity.nid);
        if (ref) {
            return this.grid.cells.get(ref.key) || this.getOrCreateCellForEntity(entity);
        }
        return this.getOrCreateCellForEntity(entity);
    }
    addToCell(entity) {
        return this.grid.add(entity.nid, entity).createdCell;
    }
    removeFromCell(entity) {
        var _a;
        return ((_a = this.grid.remove(entity.nid)) === null || _a === void 0 ? void 0 : _a.removedCell) || false;
    }
    updateSpatialCell(entity) {
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
    markCellDirtyForEntity(entity) {
        let ref = this.grid.objectCells.get(entity.nid);
        if (ref) {
            this.updateSpatialCell(entity);
            ref = this.grid.objectCells.get(entity.nid);
            if (!ref) {
                return null;
            }
            this.dirtyCells.add(ref.key);
            return this.grid.cells.get(ref.key);
        }
        const rootNid = this.localState.getRootNid(entity.nid);
        if (rootNid && rootNid !== entity.nid) {
            const rootRef = this.grid.objectCells.get(rootNid);
            if (rootRef) {
                this.dirtyCells.add(rootRef.key);
                return this.grid.cells.get(rootRef.key);
            }
        }
        if (this.strictManualWrites) {
            throw new Error(`ManualSpatialChannel3D cannot write mutation for nid ${entity.nid}; no spatial cell was found for the entity or its root.`);
        }
        return null;
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
        const spatialView = (0, SpatialView_1.normalizeSpatialView3D)(view);
        const halfWidth = spatialView.halfWidth + this.queryPadding;
        const halfHeight = spatialView.halfHeight + this.queryPadding;
        const halfDepth = spatialView.halfDepth + this.queryPadding;
        return {
            minX: this.grid.cellCoord(spatialView.x - halfWidth),
            maxX: this.grid.cellCoordForEnd(spatialView.x + halfWidth),
            minY: this.grid.cellCoord(spatialView.y - halfHeight),
            maxY: this.grid.cellCoordForEnd(spatialView.y + halfHeight),
            minZ: this.grid.cellCoord(spatialView.z - halfDepth),
            maxZ: this.grid.cellCoordForEnd(spatialView.z + halfDepth)
        };
    }
    buildVisibleCells(userId) {
        const view = this.views.get(userId);
        const keys = [];
        const nids = [];
        if (!view) {
            return { keys, nids };
        }
        const spatialView = (0, SpatialView_1.normalizeSpatialView3D)(view);
        const visibleKeys = spatialView.radius !== undefined ?
            this.grid.getVisibleCellKeysInSphere(spatialView.x, spatialView.y, spatialView.z, spatialView.radius + this.queryPadding) :
            this.grid.getVisibleCellKeys(this.viewRange(view));
        for (let i = 0; i < visibleKeys.length; i++) {
            const key = visibleKeys[i];
            const cell = this.grid.cells.get(key);
            if (!cell) {
                continue;
            }
            keys.push(key);
            for (let j = 0; j < cell.ids.length; j++) {
                nids.push(cell.ids[j]);
            }
        }
        return { keys, nids };
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
    createEntityWriter(ntype, schema) {
        const props = Object.create(null);
        const groups = Object.create(null);
        const writers = {
            ntype,
            schema,
            props,
            groups
        };
        const aliases = new Set();
        const blockedAliases = new Set(['ntype', 'schema', 'props', 'groups']);
        const addAlias = (name, writer) => {
            if (blockedAliases.has(name)) {
                return;
            }
            if (aliases.has(name)) {
                delete writers[name];
                blockedAliases.add(name);
                return;
            }
            aliases.add(name);
            writers[name] = writer;
        };
        const propNames = Object.keys(schema.props);
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i];
            const prop = schema.props[name];
            props[name] = (entity, value) => {
                const cell = this.markCellDirtyForEntity(entity);
                if (!cell) {
                    return;
                }
                cell.manualPropNids.push(entity.nid);
                cell.manualPropSchemas.push(prop);
                cell.manualPropValues.push(value);
            };
            addAlias(name, props[name]);
        }
        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i];
            if (group.props.length === 1) {
                groups[group.name] = (entity, v0) => {
                    const cell = this.markCellDirtyForEntity(entity);
                    if (!cell) {
                        return;
                    }
                    cell.manualGroupNids.push(entity.nid);
                    cell.manualGroupSchemas.push(group);
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length);
                    cell.manualGroupValues.push(v0);
                };
            }
            else if (group.props.length === 2) {
                groups[group.name] = (entity, v0, v1) => {
                    const cell = this.markCellDirtyForEntity(entity);
                    if (!cell) {
                        return;
                    }
                    cell.manualGroupNids.push(entity.nid);
                    cell.manualGroupSchemas.push(group);
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length);
                    cell.manualGroupValues.push(v0, v1);
                };
            }
            else if (group.props.length === 3) {
                groups[group.name] = (entity, v0, v1, v2) => {
                    const cell = this.markCellDirtyForEntity(entity);
                    if (!cell) {
                        return;
                    }
                    cell.manualGroupNids.push(entity.nid);
                    cell.manualGroupSchemas.push(group);
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length);
                    cell.manualGroupValues.push(v0, v1, v2);
                };
            }
            else if (group.props.length === 4) {
                groups[group.name] = (entity, v0, v1, v2, v3) => {
                    const cell = this.markCellDirtyForEntity(entity);
                    if (!cell) {
                        return;
                    }
                    cell.manualGroupNids.push(entity.nid);
                    cell.manualGroupSchemas.push(group);
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length);
                    cell.manualGroupValues.push(v0, v1, v2, v3);
                };
            }
            else {
                groups[group.name] = (entity, ...values) => {
                    const cell = this.markCellDirtyForEntity(entity);
                    if (!cell) {
                        return;
                    }
                    cell.manualGroupNids.push(entity.nid);
                    cell.manualGroupSchemas.push(group);
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length);
                    for (let j = 0; j < group.props.length; j++) {
                        cell.manualGroupValues.push(values[j]);
                    }
                };
            }
            addAlias(group.name, groups[group.name]);
        }
        return writers;
    }
    addEntity(entity) {
        this.localState.registerEntity(entity, this.nid);
        this.entities.add(entity);
        this.addToCell(entity);
        this.membershipVersion++;
        this.structuralDeltas = true;
        this.invalidateVisibleCellKeyCache();
        return entity;
    }
    markHeaderDirty() {
        if (!(0, ChannelHeader_1.hasSchemaBackedChannelHeader)(this.header)) {
            return false;
        }
        this.headerVersion++;
        return true;
    }
    updateEntity(entity) {
        this.updateSpatialCell(entity);
    }
    removeEntity(entity) {
        const nid = entity.nid;
        if (this.entities.get(nid) !== entity) {
            return 0;
        }
        const removedCell = this.removeFromCell(entity);
        this.entities.remove(entity);
        this.localState.unregisterEntity(entity, this.nid);
        this.membershipVersion++;
        this.structuralDeltas = true;
        if (removedCell) {
            this.invalidateVisibleCellKeyCache();
        }
        else {
            this.invalidateVisibleEntityCache();
        }
        return nid;
    }
    removeAllEntities() {
        Array.from(this.entities.array).forEach(entity => this.removeEntity(entity));
    }
    markDirty(entity) {
        return this.localState.markDirty(entity);
    }
    // One-frame interpolation skip for teleports, respawns, wraparound, or
    // pooled entities moved discontinuously to a new position.
    skipInterpolation(entity) {
        if (!entity || entity.nid === 0 || this.entities.get(entity.nid) !== entity) {
            return false;
        }
        this.skipInterpolationNids.push(entity.nid);
        return true;
    }
    addMessage(message) {
        // Spatial messages are culled immediately against the current user
        // views instead of being stored as channel broadcast fragments.
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId);
            if (view && this.visibilityResolver(message, view)) {
                user.queueChannelMessage(this.nid, message);
            }
        });
    }
    addInterpolatedMessage(message) {
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId);
            if (view && this.visibilityResolver(message, view)) {
                user.queueChannelInterpolatedMessage(this.nid, message);
            }
        });
    }
    clearBroadcastMessages() {
    }
    clearSnapshotDeltas() {
        for (const key of this.dirtyCells) {
            const cell = this.grid.cells.get(key);
            if (!cell) {
                continue;
            }
            cell.manualPropNids.length = 0;
            cell.manualPropSchemas.length = 0;
            cell.manualPropValues.length = 0;
            cell.manualGroupNids.length = 0;
            cell.manualGroupSchemas.length = 0;
            cell.manualGroupValueOffsets.length = 0;
            cell.manualGroupValues.length = 0;
        }
        this.dirtyCells.clear();
        this.skipInterpolationNids.length = 0;
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
        const visible = this.buildVisibleCells(userId);
        this.visibleCellKeyCache.set(userId, {
            viewVersion,
            keys: visible.keys
        });
        return visible.keys;
    }
    getVisibleEntities(userId) {
        const viewVersion = this.viewVersions.get(userId) || 0;
        const cached = this.visibleEntityCache.get(userId);
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.nids;
        }
        const visible = this.buildVisibleCells(userId);
        this.visibleEntityCache.set(userId, {
            viewVersion,
            membershipVersion: this.membershipVersion,
            nids: visible.nids
        });
        return visible.nids;
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
    getManualCellUpdateLog(key) {
        const cell = this.grid.cells.get(key);
        if (!cell) {
            return null;
        }
        if (cell.manualPropNids.length === 0 && cell.manualGroupNids.length === 0) {
            return null;
        }
        return cell;
    }
    cellHasManualUpdates(key) {
        return this.getManualCellUpdateLog(key) !== null;
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
        this.removeAllEntities();
        this.localState.nidPool.returnId(this.nid);
        this.localState.channels.delete(this);
        this.views.clear();
        this.viewVersions.clear();
        this.visibleCellKeyCache.clear();
        this.visibleEntityCache.clear();
        this.visibleNetworkedNidsCache.clear();
        this.dirtyCells.clear();
        this.rememberedCells.clear();
        this.rememberedCellSignatures.clear();
        this.grid.cells.clear();
        this.grid.objectCells.clear();
        this.visibilityResolver = () => true;
    }
}
exports.ManualSpatialChannel3D = ManualSpatialChannel3D;
