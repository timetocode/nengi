"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcsChannel = void 0;
const ChannelHeader_1 = require("../../common/ChannelHeader");
class EcsChannel {
    constructor(localState, options = {}) {
        // ECS channels are manual by design: roots are nids, components carry the
        // replicated state, and userland component writers append the mutation log.
        this.ecsChannelMode = true;
        this.users = new Map();
        this.headerVersion = 0;
        this.channelType = ChannelHeader_1.ChannelType.EcsChannel;
        this.rootNids = [];
        this.componentNids = [];
        this.membershipVersion = 0;
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
        this.skipInterpolationNids = [];
        this.broadcastMessages = [];
        this.interpolatedBroadcastMessages = [];
        this.rootSet = new Set();
        this.componentSet = new Set();
        this.componentsByRoot = new Map();
        this.componentByNid = new Map();
        this.visibleNetworkedNidsCache = null;
        this.localState = localState;
        this.nid = localState.nextNetworkId();
        this.header = (0, ChannelHeader_1.createChannelHeader)(this.nid, this.channelType, options.header, options.name);
        this.headerVersion = (0, ChannelHeader_1.hasSchemaBackedChannelHeader)(this.header) ? 1 : 0;
        this.localState.channels.add(this);
    }
    createEntity() {
        // In the ECS model a root entity is only a network id. All replicated
        // data lives on components, which keeps root CRUD cheap and avoids
        // pretending there is a monolithic entity object to scan.
        const nid = this.localState.nextNetworkId();
        this.rootNids.push(nid);
        this.rootSet.add(nid);
        this.componentsByRoot.set(nid, []);
        this.createdRoots.push(nid);
        this.membershipVersion++;
        this.visibleNetworkedNidsCache = null;
        return nid;
    }
    addEntity() {
        return this.createEntity();
    }
    markHeaderDirty() {
        if (!(0, ChannelHeader_1.hasSchemaBackedChannelHeader)(this.header)) {
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
        const rootIndex = this.rootNids.indexOf(pid);
        if (rootIndex > -1) {
            this.rootNids.splice(rootIndex, 1);
        }
        this.localState.nidPool.returnId(pid);
        this.membershipVersion++;
        this.visibleNetworkedNidsCache = null;
        return pid;
    }
    removeAllEntities() {
        const roots = this.rootNids.slice();
        for (let i = 0; i < roots.length; i++) {
            this.removeEntity(roots[i]);
        }
    }
    addComponent(pid, component) {
        if (!this.rootSet.has(pid)) {
            throw new Error(`Cannot add an ECS component to unknown entity nid ${pid}.`);
        }
        const ecsComponent = component;
        const nid = this.localState.registerEntity(ecsComponent, pid);
        ecsComponent.pid = pid;
        this.componentNids.push(nid);
        this.componentSet.add(nid);
        this.componentByNid.set(nid, ecsComponent);
        this.componentsByRoot.get(pid).push(ecsComponent);
        this.createdComponents.push(ecsComponent);
        this.membershipVersion++;
        this.visibleNetworkedNidsCache = null;
        return ecsComponent;
    }
    removeComponentInternal(componentOrNid, queueDelete) {
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
        this.visibleNetworkedNidsCache = null;
    }
    removeComponent(componentOrNid) {
        this.removeComponentInternal(componentOrNid, true);
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
    getVisibleEntities(userId) {
        return this.rootNids;
    }
    getVisibleNetworkedNids(userId) {
        const cached = this.visibleNetworkedNidsCache;
        if (cached && cached.membershipVersion === this.membershipVersion) {
            return cached.nids;
        }
        const nids = [];
        for (let i = 0; i < this.rootNids.length; i++) {
            const rootNid = this.rootNids[i];
            nids.push(rootNid);
            const components = this.componentsByRoot.get(rootNid);
            if (!components) {
                continue;
            }
            for (let j = 0; j < components.length; j++) {
                nids.push(components[j].nid);
            }
        }
        this.visibleNetworkedNidsCache = { membershipVersion: this.membershipVersion, nids };
        return nids;
    }
    subscribe(user) {
        this.users.set(user.id, user);
        user.subscribe(this);
    }
    unsubscribe(user) {
        this.users.delete(user.id);
        user.unsubscribe(this);
    }
    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user));
    }
    destroy() {
        this.unsubscribeAll();
        this.removeAllEntities();
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
        this.skipInterpolationNids.length = 0;
        this.broadcastMessages.length = 0;
        this.interpolatedBroadcastMessages.length = 0;
        this.rootSet.clear();
        this.componentSet.clear();
        this.componentsByRoot.clear();
        this.componentByNid.clear();
        this.visibleNetworkedNidsCache = null;
    }
    addMessage(message) {
        this.broadcastMessages.push(message);
    }
    addInterpolatedMessage(message) {
        this.interpolatedBroadcastMessages.push(message);
    }
    // ECS roots are ids only; skip interpolation is meaningful for stateful
    // components that the client interpolates, such as transform components.
    skipInterpolation(pidOrComponent) {
        const nid = typeof pidOrComponent === 'number' ? pidOrComponent : pidOrComponent.nid;
        if (!this.componentSet.has(nid)) {
            return false;
        }
        this.skipInterpolationNids.push(nid);
        return true;
    }
    clearBroadcastMessages() {
        this.broadcastMessages.length = 0;
        this.interpolatedBroadcastMessages.length = 0;
    }
    hasStructuralDeltas() {
        return this.createdRoots.length > 0 ||
            this.deletedRoots.length > 0 ||
            this.createdComponents.length > 0 ||
            this.deletedComponents.length > 0;
    }
    clearSnapshotDeltas() {
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
        this.skipInterpolationNids.length = 0;
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
        const propNids = this.manualPropNids;
        const propSchemas = this.manualPropSchemas;
        const propValues = this.manualPropValues;
        const propNames = Object.keys(schema.props);
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i];
            const prop = schema.props[name];
            props[name] = function writeEcsProp(component, value) {
                propNids.push(component.nid);
                propSchemas.push(prop);
                propValues.push(value);
            };
            addAlias(name, props[name]);
        }
        const groupNids = this.manualGroupNids;
        const groupNTypes = this.manualGroupNTypes;
        const groupSchemas = this.manualGroupSchemas;
        const groupValueOffsets = this.manualGroupValueOffsets;
        const groupValues = this.manualGroupValues;
        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i];
            if (group.props.length === 1) {
                groups[group.name] = function writeEcsGroup1(component, v0) {
                    groupNids.push(component.nid);
                    groupNTypes.push(ntype);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    groupValues.push(v0);
                };
            }
            else if (group.props.length === 2) {
                groups[group.name] = function writeEcsGroup2(component, v0, v1) {
                    groupNids.push(component.nid);
                    groupNTypes.push(ntype);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    groupValues.push(v0, v1);
                };
            }
            else if (group.props.length === 3) {
                groups[group.name] = function writeEcsGroup3(component, v0, v1, v2) {
                    groupNids.push(component.nid);
                    groupNTypes.push(ntype);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    groupValues.push(v0, v1, v2);
                };
            }
            else if (group.props.length === 4) {
                groups[group.name] = function writeEcsGroup4(component, v0, v1, v2, v3) {
                    groupNids.push(component.nid);
                    groupNTypes.push(ntype);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    groupValues.push(v0, v1, v2, v3);
                };
            }
            else {
                groups[group.name] = function writeEcsGroup(component) {
                    groupNids.push(component.nid);
                    groupNTypes.push(ntype);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    for (let j = 0; j < group.props.length; j++) {
                        groupValues.push(arguments[j + 1]);
                    }
                };
            }
            addAlias(group.name, groups[group.name]);
        }
        return writers;
    }
}
exports.EcsChannel = EcsChannel;
