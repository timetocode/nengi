"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameEcsWorld = void 0;
exports.componentType = componentType;
exports.localComponentType = localComponentType;
exports.resourceKey = resourceKey;
let nextLocalComponentType = -1;
function componentType(ntype, debugName) {
    return {
        ntype: ntype,
        debugName,
        create(state) {
            return Object.assign(Object.assign({}, state), { ntype });
        }
    };
}
function localComponentType(debugName) {
    const ntype = nextLocalComponentType--;
    return componentType(ntype, debugName);
}
class GameEcsWorld {
    constructor() {
        // Mirrors nengi: entity ids and component nids come from one id pool.
        this.nextLocalId = -1;
        this.entities = new Set();
        this.byPid = new Map();
        this.byType = new Map();
        this.byNid = new Map();
        this.resources = new Map();
        this.cachedQueries = new Set;
        this.touchedPids = new Set();
    }
    createEntity(pid = this.nextId()) {
        this.entities.add(pid);
        if (!this.byPid.has(pid)) {
            this.byPid.set(pid, new Map());
        }
        this.touch(pid);
        return pid;
    }
    create(pid = this.nextId()) {
        return this.createEntity(pid);
    }
    add(component) {
        this.createEntity(component.pid);
        if (component.nid === undefined) {
            component.nid = this.nextId();
        }
        this.byPid.get(component.pid).set(component.ntype, component);
        this.typeStore(component.ntype).set(component.pid, component);
        if (component.nid !== 0) {
            this.byNid.set(component.nid, component);
        }
        this.touch(component.pid);
        return component;
    }
    addLocalComponent(pid, component) {
        const stored = component;
        stored.pid = pid;
        return this.add(stored);
    }
    removeComponentByNid(nid) {
        var _a, _b;
        const component = this.byNid.get(nid);
        if (!component) {
            return undefined;
        }
        this.byNid.delete(nid);
        (_a = this.byPid.get(component.pid)) === null || _a === void 0 ? void 0 : _a.delete(component.ntype);
        (_b = this.byType.get(component.ntype)) === null || _b === void 0 ? void 0 : _b.delete(component.pid);
        this.touch(component.pid);
        return component;
    }
    removeComponent(pid, type) {
        var _a, _b, _c;
        const ntype = typeId(type);
        const component = (_a = this.byPid.get(pid)) === null || _a === void 0 ? void 0 : _a.get(ntype);
        if (!component) {
            return undefined;
        }
        (_b = this.byPid.get(pid)) === null || _b === void 0 ? void 0 : _b.delete(ntype);
        (_c = this.byType.get(ntype)) === null || _c === void 0 ? void 0 : _c.delete(pid);
        if (component.nid !== undefined) {
            this.byNid.delete(component.nid);
        }
        this.touch(pid);
        return component;
    }
    removeEntity(pid) {
        const components = this.byPid.get(pid);
        if (!components) {
            return [];
        }
        const removed = Array.from(components.values());
        removed.forEach(component => {
            var _a;
            (_a = this.byType.get(component.ntype)) === null || _a === void 0 ? void 0 : _a.delete(pid);
            if (component.nid !== undefined) {
                this.byNid.delete(component.nid);
            }
        });
        this.byPid.delete(pid);
        this.entities.delete(pid);
        this.touch(pid);
        return removed;
    }
    get(pid, def) {
        var _a;
        return (_a = this.byPid.get(pid)) === null || _a === void 0 ? void 0 : _a.get(def.ntype);
    }
    require(pid, def) {
        var _a;
        const component = this.get(pid, def);
        if (!component) {
            throw new Error(`Entity ${pid} is missing ${(_a = def.debugName) !== null && _a !== void 0 ? _a : def.ntype}`);
        }
        return component;
    }
    getByNid(nid) {
        return this.byNid.get(nid);
    }
    componentOwner(nid) {
        var _a;
        return (_a = this.byNid.get(nid)) === null || _a === void 0 ? void 0 : _a.pid;
    }
    componentNtype(nid) {
        var _a;
        return (_a = this.byNid.get(nid)) === null || _a === void 0 ? void 0 : _a.ntype;
    }
    componentNidsForEntity(pid) {
        const components = this.byPid.get(pid);
        if (!components) {
            return [];
        }
        const nids = [];
        components.forEach(component => {
            if (component.nid !== undefined) {
                nids.push(component.nid);
            }
        });
        return nids;
    }
    has(pid, type) {
        var _a, _b;
        return (_b = (_a = this.byPid.get(pid)) === null || _a === void 0 ? void 0 : _a.has(typeId(type))) !== null && _b !== void 0 ? _b : false;
    }
    query(...defs) {
        return createQuery(this, defs);
    }
    cachedQuery(...defs) {
        const query = new CachedQuery(this, defs);
        this.cachedQueries.add(query);
        query.refreshAll();
        return query;
    }
    flushQueries() {
        if (this.touchedPids.size === 0) {
            return;
        }
        const pids = Array.from(this.touchedPids);
        this.touchedPids.clear();
        this.cachedQueries.forEach(query => query.refresh(pids));
    }
    resource(key, create) {
        if (!this.resources.has(key)) {
            if (!create) {
                throw new Error(`Missing ECS resource: ${resourceName(key)}`);
            }
            this.resources.set(key, create());
        }
        return this.resources.get(key);
    }
    setResource(key, value) {
        this.resources.set(key, value);
        return value;
    }
    componentCount(type) {
        var _a, _b;
        if (type === undefined) {
            return Array.from(this.byPid.values()).reduce((sum, components) => sum + components.size, 0);
        }
        return (_b = (_a = this.byType.get(typeId(type))) === null || _a === void 0 ? void 0 : _a.size) !== null && _b !== void 0 ? _b : 0;
    }
    entityCount() {
        return this.entities.size;
    }
    identifiedComponentCount() {
        return this.byNid.size;
    }
    matchingPids(types, out = []) {
        out.length = 0;
        if (types.length === 0) {
            out.push(...this.entities);
            return out;
        }
        const store = this.smallestStore(types);
        if (!store) {
            return out;
        }
        store.forEach((_component, pid) => {
            if (this.hasAll(pid, types)) {
                out.push(pid);
            }
        });
        return out;
    }
    componentsFor(pid, defs) {
        var _a;
        const components = new Array(defs.length);
        for (let i = 0; i < defs.length; i++) {
            const component = (_a = this.byPid.get(pid)) === null || _a === void 0 ? void 0 : _a.get(defs[i].ntype);
            if (!component) {
                return undefined;
            }
            components[i] = component;
        }
        return components;
    }
    typeStore(ntype) {
        let store = this.byType.get(ntype);
        if (!store) {
            store = new Map();
            this.byType.set(ntype, store);
        }
        return store;
    }
    hasAll(pid, types) {
        const components = this.byPid.get(pid);
        if (!components) {
            return false;
        }
        for (let i = 0; i < types.length; i++) {
            if (!components.has(types[i])) {
                return false;
            }
        }
        return true;
    }
    smallestStore(types) {
        let smallest;
        for (let i = 0; i < types.length; i++) {
            const store = this.byType.get(types[i]);
            if (!store) {
                return undefined;
            }
            if (!smallest || store.size < smallest.size) {
                smallest = store;
            }
        }
        return smallest;
    }
    touch(pid) {
        this.touchedPids.add(pid);
    }
    nextId() {
        return this.nextLocalId--;
    }
}
exports.GameEcsWorld = GameEcsWorld;
function resourceKey(name) {
    return { name };
}
function createQuery(ecs, defs) {
    const types = defs.map(def => def.ntype);
    return {
        all(fn) {
            const pids = ecs.matchingPids(types);
            for (let i = 0; i < pids.length; i++) {
                const components = ecs.componentsFor(pids[i], defs);
                if (components) {
                    fn(pids[i], ...components);
                }
            }
        },
        pids(out) {
            return ecs.matchingPids(types, out);
        }
    };
}
class CachedQuery {
    constructor(ecs, defs) {
        this.ecs = ecs;
        this.defs = defs;
        this.matched = new Set();
        this.pidsCache = [];
        this.types = defs.map(def => def.ntype);
    }
    all(fn) {
        for (let i = 0; i < this.pidsCache.length; i++) {
            const pid = this.pidsCache[i];
            const components = this.ecs.componentsFor(pid, this.defs);
            if (components) {
                fn(pid, ...components);
            }
        }
    }
    pids(out = []) {
        out.length = 0;
        out.push(...this.pidsCache);
        return out;
    }
    refresh(pids) {
        let changed = false;
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i];
            const matches = this.types.every(type => this.ecs.has(pid, type));
            if (matches && !this.matched.has(pid)) {
                this.matched.add(pid);
                changed = true;
            }
            else if (!matches && this.matched.delete(pid)) {
                changed = true;
            }
        }
        if (changed) {
            this.rebuildCache();
        }
    }
    refreshAll() {
        this.matched.clear();
        this.ecs.matchingPids(this.types).forEach(pid => this.matched.add(pid));
        this.rebuildCache();
    }
    rebuildCache() {
        this.pidsCache.length = 0;
        this.pidsCache.push(...this.matched);
    }
}
function typeId(type) {
    return typeof type === 'number' ? type : type.ntype;
}
function resourceName(key) {
    return typeof key === 'function' ? key.name : key.name;
}
