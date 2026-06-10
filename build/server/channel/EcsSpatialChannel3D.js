"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcsSpatialChannel3D = void 0;
const SpatialGrid_1 = require("./SpatialGrid");
const SpatialView_1 = require("./SpatialView");
function createUpdateLog() {
    return {
        manualPropNids: [],
        manualPropSchemas: [],
        manualPropValues: [],
        manualGroupNids: [],
        manualGroupNTypes: [],
        manualGroupSchemas: [],
        manualGroupValueOffsets: [],
        manualGroupValues: []
    };
}
function initializeEcsSpatialCell(cell) {
    Object.assign(cell, createUpdateLog());
}
// EcsSpatialChannel3D intentionally mirrors EcsSpatialChannel2D instead of
// using a dimension-generic wrapper; this is snapshot hot-path code, so
// benchmark before collapsing the parallel implementations.
class EcsSpatialChannel3D {
    constructor(localState, cellSize, options = {}) {
        var _a, _b, _c;
        this.ecsSpatialChannelMode = true;
        this.ecsChannelMode = true;
        this.users = new Map();
        this.header = null;
        this.headerVersion = 0;
        this.visibilityResolver = SpatialView_1.objectInSpatialView3D;
        this.membershipVersion = 0;
        this.rootNids = [];
        this.componentNids = [];
        this.createdRoots = [];
        this.deletedRoots = [];
        this.createdComponents = [];
        this.deletedComponents = [];
        this.rootDeletedComponents = [];
        this.manualPropNids = [];
        this.manualPropSchemas = [];
        this.manualPropValues = [];
        this.manualGroupNids = [];
        this.manualGroupNTypes = [];
        this.manualGroupSchemas = [];
        this.manualGroupValueOffsets = [];
        this.manualGroupValues = [];
        this.dirtyCells = new Set();
        this.broadcastMessages = [];
        this.rootSet = new Set();
        this.componentSet = new Set();
        this.componentsByRoot = new Map();
        this.componentByNid = new Map();
        this.spatialComponentByRoot = new Map();
        this.views = new Map();
        this.viewVersions = new Map();
        this.visibleCellKeyCache = new Map();
        this.visibleNetworkedNidsCache = new Map();
        this.movedRoots = [];
        this.structuralDeltas = false;
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('EcsSpatialChannel3D requires a positive finite cell size.');
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('EcsSpatialChannel3D queryPadding must be a non-negative finite number.');
        }
        this.localState = localState;
        this.nid = localState.nextNetworkId();
        this.label = options.label;
        this.cellSize = cellSize;
        this.queryPadding = options.queryPadding || 0;
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16));
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64));
        this.spatialXProp = ((_a = options.spatialProps) === null || _a === void 0 ? void 0 : _a.x) || 'x';
        this.spatialYProp = ((_b = options.spatialProps) === null || _b === void 0 ? void 0 : _b.y) || 'y';
        this.spatialZProp = ((_c = options.spatialProps) === null || _c === void 0 ? void 0 : _c.z) || 'z';
        this.debugManualWrites = options.debugManualWrites === true;
        this.grid = new SpatialGrid_1.SpatialGrid3D({
            cellSize,
            getX: component => component[this.spatialXProp],
            getY: component => component[this.spatialYProp],
            getZ: component => component[this.spatialZProp],
            initializeCell: initializeEcsSpatialCell
        });
        this.localState.channels.add(this);
        if (options.header) {
            this.setHeader(options.header);
        }
    }
    addRootToCell(pid, component) {
        return this.grid.add(pid, component).createdCell;
    }
    removeRootFromCell(pid) {
        var _a;
        return ((_a = this.grid.remove(pid)) === null || _a === void 0 ? void 0 : _a.removedCell) || false;
    }
    updateRootCell(pid) {
        const component = this.spatialComponentByRoot.get(pid);
        if (!component) {
            return;
        }
        const move = this.grid.update(pid, component);
        if (!move) {
            return;
        }
        this.movedRoots.push({ pid, fromCell: move.fromCell, toCell: move.toCell });
        this.membershipVersion++;
        this.structuralDeltas = true;
        if (move.removedCell || move.createdCell) {
            this.invalidateVisibleCellKeyCache();
        }
        else {
            this.invalidateVisibleNetworkedNidsCache();
        }
    }
    invalidateVisibleNetworkedNidsCache() {
        this.visibleNetworkedNidsCache.clear();
    }
    invalidateVisibleCellKeyCache() {
        this.visibleCellKeyCache.clear();
        this.invalidateVisibleNetworkedNidsCache();
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
    defaultView() {
        // Plain ECS channels can subscribe without a view. Spatial ECS keeps
        // that ergonomic path by treating omitted views as all-visible; games
        // that need culling should updateView/subscribe with a real view.
        return {
            x: 0,
            y: 0,
            z: 0,
            halfWidth: Number.MAX_SAFE_INTEGER,
            halfHeight: Number.MAX_SAFE_INTEGER,
            halfDepth: Number.MAX_SAFE_INTEGER
        };
    }
    isCellVisible(userId, key) {
        const view = this.views.get(userId);
        if (!view) {
            return false;
        }
        const firstSeparator = key.indexOf(':');
        const secondSeparator = key.indexOf(':', firstSeparator + 1);
        const x = Number(key.slice(0, firstSeparator));
        const y = Number(key.slice(firstSeparator + 1, secondSeparator));
        const z = Number(key.slice(secondSeparator + 1));
        const spatialView = (0, SpatialView_1.normalizeSpatialView3D)(view);
        if (spatialView.radius !== undefined) {
            const cellMinX = x * this.cellSize;
            const cellMaxX = cellMinX + this.cellSize;
            const cellMinY = y * this.cellSize;
            const cellMaxY = cellMinY + this.cellSize;
            const cellMinZ = z * this.cellSize;
            const cellMaxZ = cellMinZ + this.cellSize;
            const nearestX = spatialView.x < cellMinX ? cellMinX : spatialView.x > cellMaxX ? cellMaxX : spatialView.x;
            const nearestY = spatialView.y < cellMinY ? cellMinY : spatialView.y > cellMaxY ? cellMaxY : spatialView.y;
            const nearestZ = spatialView.z < cellMinZ ? cellMinZ : spatialView.z > cellMaxZ ? cellMaxZ : spatialView.z;
            const dx = spatialView.x - nearestX;
            const dy = spatialView.y - nearestY;
            const dz = spatialView.z - nearestZ;
            const radius = spatialView.radius + this.queryPadding;
            return dx * dx + dy * dy + dz * dz <= radius * radius;
        }
        const range = this.viewRange(view);
        return x >= range.minX && x <= range.maxX &&
            y >= range.minY && y <= range.maxY &&
            z >= range.minZ && z <= range.maxZ;
    }
    getComponentCell(component) {
        const pid = component.pid;
        const spatial = this.spatialComponentByRoot.get(pid);
        if (spatial) {
            this.updateRootCell(pid);
        }
        const ref = this.grid.objectCells.get(pid);
        return ref ? this.grid.cells.get(ref.key) || null : null;
    }
    markCellDirtyForComponent(component) {
        const cell = this.getComponentCell(component);
        if (!cell) {
            if (this.debugManualWrites) {
                throw new Error(`EcsSpatialChannel3D cannot write mutation for component nid ${component.nid}; no spatial cell was found for pid ${component.pid}.`);
            }
            return null;
        }
        this.dirtyCells.add(cell.key);
        return cell;
    }
    buildVisibleCellKeys(userId) {
        const view = this.views.get(userId);
        const keys = [];
        if (!view) {
            return keys;
        }
        const spatialView = (0, SpatialView_1.normalizeSpatialView3D)(view);
        return spatialView.radius !== undefined ?
            this.grid.getVisibleCellKeysInSphere(spatialView.x, spatialView.y, spatialView.z, spatialView.radius + this.queryPadding) :
            this.grid.getVisibleCellKeys(this.viewRange(view));
    }
    appendRootNetworkedNids(pid, nids) {
        nids.push(pid);
        const components = this.componentsByRoot.get(pid);
        if (!components) {
            return;
        }
        for (let i = 0; i < components.length; i++) {
            nids.push(components[i].nid);
        }
    }
    tick(tick) {
    }
    createEntity() {
        const nid = this.localState.nextNetworkId();
        this.rootNids.push(nid);
        this.rootSet.add(nid);
        this.componentsByRoot.set(nid, []);
        this.createdRoots.push(nid);
        this.membershipVersion++;
        this.structuralDeltas = true;
        this.invalidateVisibleNetworkedNidsCache();
        return nid;
    }
    addEntity() {
        return this.createEntity();
    }
    setHeader(header) {
        if (this.header !== null && this.header !== header) {
            throw new Error('Channel header is already set. Mutate the existing header and call markHeaderDirty().');
        }
        if (this.header === header) {
            return header;
        }
        this.localState.registerEntity(header, this.nid);
        this.header = header;
        this.headerVersion++;
        return header;
    }
    getHeader() {
        return this.header;
    }
    markHeaderDirty() {
        if (!this.header) {
            return false;
        }
        this.headerVersion++;
        return true;
    }
    removeEntity(pidOrEntity) {
        const pid = typeof pidOrEntity === 'number' ? pidOrEntity : pidOrEntity.nid;
        if (!this.rootSet.has(pid)) {
            return 0;
        }
        const components = this.componentsByRoot.get(pid) || [];
        for (let i = components.length - 1; i >= 0; i--) {
            this.removeComponentInternal(components[i], false);
        }
        const createdIndex = this.createdRoots.indexOf(pid);
        if (createdIndex > -1) {
            this.createdRoots.splice(createdIndex, 1);
        }
        else {
            this.deletedRoots.push(pid);
        }
        this.rootSet.delete(pid);
        this.componentsByRoot.delete(pid);
        this.spatialComponentByRoot.delete(pid);
        const removedCell = this.removeRootFromCell(pid);
        const rootIndex = this.rootNids.indexOf(pid);
        if (rootIndex > -1) {
            this.rootNids.splice(rootIndex, 1);
        }
        this.localState.nidPool.returnId(pid);
        this.membershipVersion++;
        this.structuralDeltas = true;
        if (removedCell) {
            this.invalidateVisibleCellKeyCache();
        }
        else {
            this.invalidateVisibleNetworkedNidsCache();
        }
        return pid;
    }
    removeAllEntities() {
        const roots = this.rootNids.slice();
        for (let i = 0; i < roots.length; i++) {
            this.removeEntity(roots[i]);
        }
    }
    addComponent(pid, component, options = {}) {
        if (!this.rootSet.has(pid)) {
            throw new Error(`Cannot add an ECS spatial component to unknown entity nid ${pid}.`);
        }
        const ecsComponent = component;
        const nid = this.localState.registerEntity(ecsComponent, pid);
        ecsComponent.pid = pid;
        this.componentNids.push(nid);
        this.componentSet.add(nid);
        this.componentByNid.set(nid, ecsComponent);
        this.componentsByRoot.get(pid).push(ecsComponent);
        if (options.spatial) {
            this.spatialComponentByRoot.set(pid, ecsComponent);
            if (!this.grid.objectCells.has(pid)) {
                this.addRootToCell(pid, ecsComponent);
            }
            else {
                this.updateRootCell(pid);
            }
        }
        this.createdComponents.push(ecsComponent);
        this.membershipVersion++;
        this.structuralDeltas = true;
        this.invalidateVisibleNetworkedNidsCache();
        return ecsComponent;
    }
    addSpatialComponent(pid, component) {
        return this.addComponent(pid, component, { spatial: true });
    }
    removeComponentInternal(componentOrNid, queueDelete) {
        var _a;
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid;
        const component = this.componentByNid.get(nid);
        if (!component) {
            return;
        }
        const pid = component.pid;
        const createdIndex = this.createdComponents.findIndex(created => created.nid === nid);
        if (createdIndex > -1) {
            this.createdComponents.splice(createdIndex, 1);
        }
        else if (queueDelete) {
            this.deletedComponents.push(nid);
        }
        else {
            this.rootDeletedComponents.push(nid);
        }
        if (((_a = this.spatialComponentByRoot.get(pid)) === null || _a === void 0 ? void 0 : _a.nid) === nid) {
            this.spatialComponentByRoot.delete(pid);
            this.removeRootFromCell(pid);
        }
        this.componentSet.delete(nid);
        this.componentByNid.delete(nid);
        const componentIndex = this.componentNids.indexOf(nid);
        if (componentIndex > -1) {
            this.componentNids.splice(componentIndex, 1);
        }
        const components = this.componentsByRoot.get(pid);
        if (components) {
            const rootComponentIndex = components.findIndex(rootComponent => rootComponent.nid === nid);
            if (rootComponentIndex > -1) {
                components.splice(rootComponentIndex, 1);
            }
        }
        this.localState.unregisterEntity(component, pid);
        this.membershipVersion++;
        this.structuralDeltas = true;
        this.invalidateVisibleNetworkedNidsCache();
    }
    removeComponent(componentOrNid) {
        this.removeComponentInternal(componentOrNid, true);
    }
    setSpatialComponent(pid, componentOrNid) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid;
        const component = this.componentByNid.get(nid);
        if (!component || component.pid !== pid) {
            throw new Error(`Cannot use component nid ${nid} as spatial component for ECS entity nid ${pid}.`);
        }
        this.spatialComponentByRoot.set(pid, component);
        if (!this.grid.objectCells.has(pid)) {
            this.addRootToCell(pid, component);
            this.membershipVersion++;
            this.structuralDeltas = true;
            this.invalidateVisibleCellKeyCache();
        }
        else {
            this.updateRootCell(pid);
        }
    }
    updateSpatialComponent(componentOrNid) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid;
        const component = this.componentByNid.get(nid);
        if (component) {
            this.updateRootCell(component.pid);
        }
    }
    isRootNid(nid) {
        return this.rootSet.has(nid) || this.deletedRoots.indexOf(nid) > -1;
    }
    isComponentNid(nid) {
        return this.componentSet.has(nid) || this.deletedComponents.indexOf(nid) > -1;
    }
    isRootDeletedComponentNid(nid) {
        return this.rootDeletedComponents.indexOf(nid) > -1;
    }
    getComponent(nid) {
        return this.componentByNid.get(nid);
    }
    getRootComponents(pid) {
        return this.componentsByRoot.get(pid) || [];
    }
    getVisibleEntities(userId) {
        const roots = [];
        const keys = this.getVisibleCellKeys(userId);
        for (let i = 0; i < keys.length; i++) {
            const cell = this.grid.cells.get(keys[i]);
            if (!cell) {
                continue;
            }
            roots.push(...cell.ids);
        }
        return roots;
    }
    getVisibleNetworkedNids(userId) {
        const viewVersion = this.viewVersions.get(userId) || 0;
        const cached = this.visibleNetworkedNidsCache.get(userId);
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.nids;
        }
        const nids = [];
        const keys = this.getVisibleCellKeys(userId);
        for (let i = 0; i < keys.length; i++) {
            const cell = this.grid.cells.get(keys[i]);
            if (!cell) {
                continue;
            }
            for (let j = 0; j < cell.ids.length; j++) {
                this.appendRootNetworkedNids(cell.ids[j], nids);
            }
        }
        this.visibleNetworkedNidsCache.set(userId, { viewVersion, membershipVersion: this.membershipVersion, nids });
        return nids;
    }
    getVisibleCellKeys(userId) {
        const viewVersion = this.viewVersions.get(userId) || 0;
        const cached = this.visibleCellKeyCache.get(userId);
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.keys;
        }
        const keys = this.buildVisibleCellKeys(userId);
        this.visibleCellKeyCache.set(userId, { viewVersion, membershipVersion: this.membershipVersion, keys });
        return keys;
    }
    getCellRootNids(key) {
        var _a;
        return ((_a = this.grid.cells.get(key)) === null || _a === void 0 ? void 0 : _a.ids) || [];
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
    hasOnlyMovementDeltas() {
        return this.movedRoots.length > 0 &&
            this.createdRoots.length === 0 &&
            this.deletedRoots.length === 0 &&
            this.createdComponents.length === 0 &&
            this.deletedComponents.length === 0 &&
            this.rootDeletedComponents.length === 0;
    }
    hasManualUpdates() {
        return this.manualPropNids.length > 0 || this.manualGroupNids.length > 0 || this.dirtyCells.size > 0;
    }
    subscribe(user, view) {
        this.views.set(user.id, view || this.defaultView());
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
        this.visibleNetworkedNidsCache.delete(user.id);
    }
    unsubscribe(user) {
        this.views.delete(user.id);
        this.viewVersions.delete(user.id);
        this.visibleCellKeyCache.delete(user.id);
        this.visibleNetworkedNidsCache.delete(user.id);
        this.users.delete(user.id);
        user.unsubscribe(this);
    }
    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user));
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
        const clearLog = (log) => {
            log.manualPropNids.length = 0;
            log.manualPropSchemas.length = 0;
            log.manualPropValues.length = 0;
            log.manualGroupNids.length = 0;
            log.manualGroupNTypes.length = 0;
            log.manualGroupSchemas.length = 0;
            log.manualGroupValueOffsets.length = 0;
            log.manualGroupValues.length = 0;
        };
        for (const key of this.dirtyCells) {
            const cell = this.grid.cells.get(key);
            if (cell) {
                clearLog(cell);
            }
        }
        clearLog(this);
        this.createdRoots.length = 0;
        this.deletedRoots.length = 0;
        this.createdComponents.length = 0;
        this.deletedComponents.length = 0;
        this.rootDeletedComponents.length = 0;
        this.dirtyCells.clear();
        this.movedRoots.length = 0;
        this.structuralDeltas = false;
    }
    destroy() {
        this.unsubscribeAll();
        this.removeAllEntities();
        if (this.header) {
            this.localState.unregisterEntity(this.header, this.nid);
            this.header = null;
            this.headerVersion++;
        }
        this.localState.nidPool.returnId(this.nid);
        this.localState.channels.delete(this);
        this.rootNids.length = 0;
        this.componentNids.length = 0;
        this.createdRoots.length = 0;
        this.deletedRoots.length = 0;
        this.createdComponents.length = 0;
        this.deletedComponents.length = 0;
        this.rootDeletedComponents.length = 0;
        this.manualPropNids.length = 0;
        this.manualPropSchemas.length = 0;
        this.manualPropValues.length = 0;
        this.manualGroupNids.length = 0;
        this.manualGroupNTypes.length = 0;
        this.manualGroupSchemas.length = 0;
        this.manualGroupValueOffsets.length = 0;
        this.manualGroupValues.length = 0;
        this.dirtyCells.clear();
        this.broadcastMessages.length = 0;
        this.rootSet.clear();
        this.componentSet.clear();
        this.componentsByRoot.clear();
        this.componentByNid.clear();
        this.spatialComponentByRoot.clear();
        this.views.clear();
        this.viewVersions.clear();
        this.visibleCellKeyCache.clear();
        this.visibleNetworkedNidsCache.clear();
        this.grid.cells.clear();
        this.grid.objectCells.clear();
        this.movedRoots.length = 0;
        this.structuralDeltas = false;
    }
    createComponentWriter(ntype, schema) {
        const props = Object.create(null);
        const groups = Object.create(null);
        const writers = { ntype, schema, props, groups };
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
            props[name] = (component, value) => {
                const cell = this.markCellDirtyForComponent(component);
                if (!cell) {
                    return;
                }
                cell.manualPropNids.push(component.nid);
                cell.manualPropSchemas.push(prop);
                cell.manualPropValues.push(value);
                this.manualPropNids.push(component.nid);
                this.manualPropSchemas.push(prop);
                this.manualPropValues.push(value);
            };
            addAlias(name, props[name]);
        }
        const writeGroup = (component, group, values) => {
            const cell = this.markCellDirtyForComponent(component);
            if (!cell) {
                return;
            }
            cell.manualGroupNids.push(component.nid);
            cell.manualGroupNTypes.push(ntype);
            cell.manualGroupSchemas.push(group);
            cell.manualGroupValueOffsets.push(cell.manualGroupValues.length);
            this.manualGroupNids.push(component.nid);
            this.manualGroupNTypes.push(ntype);
            this.manualGroupSchemas.push(group);
            this.manualGroupValueOffsets.push(this.manualGroupValues.length);
            for (let i = 0; i < group.props.length; i++) {
                cell.manualGroupValues.push(values[i + 1]);
                this.manualGroupValues.push(values[i + 1]);
            }
        };
        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i];
            groups[group.name] = function writeEcsSpatialGroup(component) {
                writeGroup(component, group, arguments);
            };
            addAlias(group.name, groups[group.name]);
        }
        return writers;
    }
}
exports.EcsSpatialChannel3D = EcsSpatialChannel3D;
