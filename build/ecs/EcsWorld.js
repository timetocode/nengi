"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcsQuery = exports.EcsWorld = void 0;
exports.componentType = componentType;
exports.localComponentType = localComponentType;
exports.readSystem = readSystem;
exports.writeSystem = writeSystem;
exports.runSystems = runSystems;
function componentType(ntype) {
    return { ntype };
}
let nextGeneratedLocalComponentType = -1;
function localComponentType(debugName) {
    const type = {
        ntype: nextGeneratedLocalComponentType--,
        debugName,
        create(state) {
            return Object.assign(state, { ntype: type.ntype });
        }
    };
    return type;
}
class EcsWorld {
    constructor(options = {}) {
        var _a, _b;
        this.componentsByRoot = new Map();
        this.componentsByNid = new Map();
        this.rootsByType = new Map();
        this.writersByType = new Map();
        this.resourcesByCtor = new Map();
        this.queries = new Set();
        this.touchedRoots = new Set();
        this.channel = options.channel;
        this.nextLocalPid = (_a = options.localPidStart) !== null && _a !== void 0 ? _a : -1;
        this.nextLocalComponentNid = (_b = options.localComponentNidStart) !== null && _b !== void 0 ? _b : -1;
    }
    setNetworkChannel(channel) {
        this.channel = channel;
        return this;
    }
    registerWriter(type, writer) {
        const ntype = typeof type === 'number' ? type : type.ntype;
        this.writersByType.set(ntype, writer);
        this.ensureType(ntype);
        return writer;
    }
    resource(ctor, create) {
        if (this.resourcesByCtor.has(ctor)) {
            return this.resourcesByCtor.get(ctor);
        }
        const value = create ? create() : new ctor();
        this.resourcesByCtor.set(ctor, value);
        return value;
    }
    getResource(ctor) {
        return this.resourcesByCtor.get(ctor);
    }
    setResource(ctor, value) {
        this.resourcesByCtor.set(ctor, value);
        return value;
    }
    hasResource(ctor) {
        return this.resourcesByCtor.has(ctor);
    }
    removeResource(ctor) {
        return this.resourcesByCtor.delete(ctor);
    }
    mono(ctor, create) {
        return this.resource(ctor, create);
    }
    getMono(ctor) {
        return this.getResource(ctor);
    }
    setMono(ctor, value) {
        return this.setResource(ctor, value);
    }
    hasMono(ctor) {
        return this.hasResource(ctor);
    }
    removeMono(ctor) {
        return this.removeResource(ctor);
    }
    query(name, ...ctors) {
        const query = new EcsQuery(name, this, ctors);
        this.queries.add(query);
        query.refreshAll();
        return query;
    }
    flushQueries() {
        if (this.touchedRoots.size === 0) {
            return;
        }
        const touched = Array.from(this.touchedRoots);
        this.touchedRoots.clear();
        for (const query of this.queries) {
            query.refresh(touched);
        }
    }
    refreshQueries() {
        this.touchedRoots.clear();
        for (const query of this.queries) {
            query.refreshAll();
        }
    }
    createEntity(options = {}) {
        const pid = options.networked ? this.requireChannel().createEntity() : this.nextLocalPid--;
        this.componentsByRoot.set(pid, new Map());
        this.markRootTouched(pid);
        return pid;
    }
    createLocalEntity() {
        return this.createEntity();
    }
    createNetworkEntity() {
        return this.createEntity({ networked: true });
    }
    removeEntity(pid) {
        var _a;
        const records = this.componentsByRoot.get(pid);
        if (!records) {
            return false;
        }
        this.markRootTouched(pid);
        for (const [ntype, record] of records) {
            (_a = this.rootsByType.get(ntype)) === null || _a === void 0 ? void 0 : _a.delete(pid);
            const component = record.component;
            if (record.networked && component.nid !== undefined) {
                this.componentsByNid.delete(component.nid);
            }
        }
        this.componentsByRoot.delete(pid);
        if (this.channel && this.isNetworkId(pid)) {
            this.channel.removeEntity(pid);
        }
        return true;
    }
    addLocalComponent(pid, component) {
        const local = component;
        local.pid = pid;
        if (local.nid === undefined) {
            local.nid = this.nextLocalComponentNid--;
        }
        this.addRecord(pid, local, false);
        return component;
    }
    addNetworkComponent(pid, component) {
        const added = this.requireChannel().addComponent(pid, component);
        this.addRecord(pid, added, true);
        this.componentsByNid.set(added.nid, added);
        return added;
    }
    addSpatialComponent(pid, component) {
        const channel = this.requireSpatialChannel();
        const added = channel.addSpatialComponent(pid, component);
        this.addRecord(pid, added, true);
        this.componentsByNid.set(added.nid, added);
        return added;
    }
    removeComponent(pid, ntype) {
        var _a, _b;
        const records = this.componentsByRoot.get(pid);
        const record = records === null || records === void 0 ? void 0 : records.get(ntype);
        if (!records || !record) {
            return false;
        }
        records.delete(ntype);
        (_a = this.rootsByType.get(ntype)) === null || _a === void 0 ? void 0 : _a.delete(pid);
        this.markRootTouched(pid);
        const component = record.component;
        if (record.networked && component.nid !== undefined) {
            this.componentsByNid.delete(component.nid);
            (_b = this.channel) === null || _b === void 0 ? void 0 : _b.removeComponent(component.nid);
        }
        return true;
    }
    get(pid, ctor) {
        var _a, _b;
        return (_b = (_a = this.componentsByRoot.get(pid)) === null || _a === void 0 ? void 0 : _a.get(ctor.ntype)) === null || _b === void 0 ? void 0 : _b.component;
    }
    c(pid, ctor) {
        return this.component(pid, ctor);
    }
    component(pid, ctor) {
        const component = this.get(pid, ctor);
        if (!component) {
            throw new Error(`Entity ${pid} does not have component type ${ctor.ntype}.`);
        }
        return component;
    }
    require(pid, ctor) {
        return this.component(pid, ctor);
    }
    getC(pid, ntype) {
        var _a, _b;
        return (_b = (_a = this.componentsByRoot.get(pid)) === null || _a === void 0 ? void 0 : _a.get(ntype)) === null || _b === void 0 ? void 0 : _b.component;
    }
    getByType(pid, ntype) {
        return this.getC(pid, ntype);
    }
    requireC(pid, ntype) {
        const component = this.getC(pid, ntype);
        if (!component) {
            throw new Error(`Entity ${pid} does not have component type ${ntype}.`);
        }
        return component;
    }
    getByNid(nid) {
        return this.componentsByNid.get(nid);
    }
    has(pid, ntype) {
        var _a, _b;
        return (_b = (_a = this.componentsByRoot.get(pid)) === null || _a === void 0 ? void 0 : _a.has(ntype)) !== null && _b !== void 0 ? _b : false;
    }
    hasAll(pid, ...types) {
        const records = this.componentsByRoot.get(pid);
        if (!records) {
            return false;
        }
        for (let i = 0; i < types.length; i++) {
            if (!records.has(types[i])) {
                return false;
            }
        }
        return true;
    }
    queryPids(...types) {
        if (types.length === 0) {
            return Array.from(this.componentsByRoot.keys());
        }
        const smallest = this.findSmallestRootSet(types);
        if (!smallest) {
            return [];
        }
        const out = [];
        this.collectQuery(types, smallest, out);
        return out;
    }
    queryInto(types, out) {
        out.length = 0;
        if (types.length === 0) {
            for (const pid of this.componentsByRoot.keys()) {
                out.push(pid);
            }
            return out;
        }
        const smallest = this.findSmallestRootSet(types);
        if (smallest) {
            this.collectQuery(types, smallest, out);
        }
        return out;
    }
    query2(c0, c1) {
        const pids = this.queryPids(c0.ntype, c1.ntype);
        const rows = [];
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i];
            rows.push([pid, this.component(pid, c0), this.component(pid, c1)]);
        }
        return rows;
    }
    forEach2(c0, c1, fn) {
        const pids = this.queryPids(c0.ntype, c1.ntype);
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i];
            fn(pid, this.component(pid, c0), this.component(pid, c1));
        }
    }
    forEach3(c0, c1, c2, fn) {
        const pids = this.queryPids(c0.ntype, c1.ntype, c2.ntype);
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i];
            fn(pid, this.component(pid, c0), this.component(pid, c1), this.component(pid, c2));
        }
    }
    queryTypes(...ctors) {
        const types = new Array(ctors.length);
        for (let i = 0; i < ctors.length; i++) {
            types[i] = ctors[i].ntype;
        }
        return this.queryPids(...types);
    }
    forEach(ctor, fn) {
        const roots = this.rootsByType.get(ctor.ntype);
        if (!roots) {
            return;
        }
        for (const pid of roots) {
            const component = this.get(pid, ctor);
            if (component) {
                fn(pid, component);
            }
        }
    }
    read(ctor, fn) {
        this.forEach(ctor, fn);
    }
    read2(c0, c1, fn) {
        this.forEach2(c0, c1, fn);
    }
    read3(c0, c1, c2, fn) {
        this.forEach3(c0, c1, c2, fn);
    }
    write(ctor, fn) {
        this.forEach(ctor, fn);
    }
    write2(c0, c1, fn) {
        this.forEach2(c0, c1, fn);
    }
    write3(c0, c1, c2, fn) {
        this.forEach3(c0, c1, c2, fn);
    }
    set(component, prop, value) {
        var _a, _b, _c;
        component[prop] = value;
        (_c = (_a = this.writersByType.get(component.ntype)) === null || _a === void 0 ? void 0 : (_b = _a.props)[prop]) === null || _c === void 0 ? void 0 : _c.call(_b, component, value);
    }
    group(component, groupName, ...values) {
        const writer = this.writersByType.get(component.ntype);
        if (!writer) {
            throw new Error(`No ECS writer registered for component type ${component.ntype}.`);
        }
        const group = writer.groups[groupName];
        if (!group) {
            throw new Error(`No ECS group writer '${groupName}' for component type ${component.ntype}.`);
        }
        group(component, ...values);
    }
    componentTypes(pid) {
        var _a, _b;
        return Array.from((_b = (_a = this.componentsByRoot.get(pid)) === null || _a === void 0 ? void 0 : _a.keys()) !== null && _b !== void 0 ? _b : []);
    }
    components(pid) {
        const records = this.componentsByRoot.get(pid);
        if (!records) {
            return [];
        }
        const components = [];
        for (const record of records.values()) {
            components.push(record.component);
        }
        return components;
    }
    rootsWith(ntype) {
        var _a;
        return Array.from((_a = this.rootsByType.get(ntype)) !== null && _a !== void 0 ? _a : []);
    }
    isNetworkedComponent(pid, ntype) {
        var _a, _b, _c;
        return (_c = (_b = (_a = this.componentsByRoot.get(pid)) === null || _a === void 0 ? void 0 : _a.get(ntype)) === null || _b === void 0 ? void 0 : _b.networked) !== null && _c !== void 0 ? _c : false;
    }
    isLocalId(id) {
        return id < 0;
    }
    isNetworkId(id) {
        return id > 0;
    }
    countEntities() {
        return this.componentsByRoot.size;
    }
    countComponents(ntype) {
        var _a, _b;
        if (ntype !== undefined) {
            return (_b = (_a = this.rootsByType.get(ntype)) === null || _a === void 0 ? void 0 : _a.size) !== null && _b !== void 0 ? _b : 0;
        }
        let count = 0;
        for (const records of this.componentsByRoot.values()) {
            count += records.size;
        }
        return count;
    }
    debugStats() {
        return {
            entities: this.countEntities(),
            components: this.countComponents(),
            componentTypes: this.rootsByType.size,
            networkComponents: this.componentsByNid.size,
            resources: this.resourcesByCtor.size,
            queries: this.queries.size
        };
    }
    addRecord(pid, component, networked) {
        const records = this.componentsByRoot.get(pid);
        if (!records) {
            throw new Error(`Cannot add component to unknown ECS entity ${pid}.`);
        }
        const existing = records.get(component.ntype);
        if (existing) {
            const existingNetwork = existing.component;
            if (existing.networked && existingNetwork.nid !== undefined) {
                this.componentsByNid.delete(existingNetwork.nid);
            }
        }
        records.set(component.ntype, { component, networked });
        this.ensureType(component.ntype);
        this.rootsByType.get(component.ntype).add(pid);
        this.markRootTouched(pid);
    }
    ensureType(ntype) {
        if (!this.rootsByType.has(ntype)) {
            this.rootsByType.set(ntype, new Set());
        }
    }
    findSmallestRootSet(types) {
        let smallest;
        for (let i = 0; i < types.length; i++) {
            const roots = this.rootsByType.get(types[i]);
            if (!roots) {
                return undefined;
            }
            if (!smallest || roots.size < smallest.size) {
                smallest = roots;
            }
        }
        return smallest;
    }
    collectQuery(types, candidates, out) {
        outer: for (const pid of candidates) {
            const records = this.componentsByRoot.get(pid);
            if (!records) {
                continue;
            }
            for (let i = 0; i < types.length; i++) {
                if (!records.has(types[i])) {
                    continue outer;
                }
            }
            out.push(pid);
        }
    }
    markRootTouched(pid) {
        this.touchedRoots.add(pid);
    }
    requireChannel() {
        if (!this.channel) {
            throw new Error('This EcsWorld was not constructed with a nengi ECS channel.');
        }
        return this.channel;
    }
    requireSpatialChannel() {
        const channel = this.requireChannel();
        if (!('addSpatialComponent' in channel)) {
            throw new Error('This EcsWorld channel is not spatial.');
        }
        return channel;
    }
}
exports.EcsWorld = EcsWorld;
class EcsQuery {
    constructor(name, world, ctors) {
        this.name = name;
        this.world = world;
        this.ctors = ctors;
        this.matchingRoots = new Set();
        this.enterHandlers = [];
        this.exitHandlers = [];
        this.ntypes = new Array(ctors.length);
        for (let i = 0; i < ctors.length; i++) {
            this.ntypes[i] = ctors[i].ntype;
        }
    }
    onEnter(fn, options = {}) {
        this.enterHandlers.push(fn);
        if (options.includeExisting) {
            this.each(fn);
        }
        return this;
    }
    onExit(fn) {
        this.exitHandlers.push(fn);
        return this;
    }
    each(fn) {
        for (const pid of this.matchingRoots) {
            const components = this.collectComponents(pid);
            if (components) {
                fn(pid, ...components);
            }
        }
    }
    eachComponents(fn) {
        for (const pid of this.matchingRoots) {
            const components = this.collectComponents(pid);
            if (components) {
                fn(...components);
            }
        }
    }
    has(pid) {
        return this.matchingRoots.has(pid);
    }
    roots() {
        return Array.from(this.matchingRoots);
    }
    size() {
        return this.matchingRoots.size;
    }
    refresh(pids) {
        for (const pid of pids) {
            this.refreshRoot(pid);
        }
    }
    refreshOne(pid) {
        this.refreshRoot(pid);
    }
    refreshAll() {
        const candidates = new Set(this.matchingRoots);
        const matches = this.world.queryPids(...this.ntypes);
        for (let i = 0; i < matches.length; i++) {
            candidates.add(matches[i]);
        }
        this.refresh(candidates);
    }
    refreshRoot(pid) {
        const had = this.matchingRoots.has(pid);
        const has = this.world.hasAll(pid, ...this.ntypes);
        if (!had && has) {
            const components = this.collectComponents(pid);
            if (!components) {
                return;
            }
            this.matchingRoots.add(pid);
            for (let i = 0; i < this.enterHandlers.length; i++) {
                this.enterHandlers[i](pid, ...components);
            }
            return;
        }
        if (had && !has) {
            this.matchingRoots.delete(pid);
            for (let i = 0; i < this.exitHandlers.length; i++) {
                this.exitHandlers[i](pid);
            }
        }
    }
    collectComponents(pid) {
        const components = new Array(this.ctors.length);
        for (let i = 0; i < this.ctors.length; i++) {
            const component = this.world.get(pid, this.ctors[i]);
            if (!component) {
                return undefined;
            }
            components[i] = component;
        }
        return components;
    }
}
exports.EcsQuery = EcsQuery;
function readSystem(name, run) {
    return { name, mode: 'read', run };
}
function writeSystem(name, run) {
    return { name, mode: 'write', run };
}
function runSystems(world, systems, dtMs) {
    for (let i = 0; i < systems.length; i++) {
        systems[i].run(world, dtMs);
    }
}
