"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = void 0;
const NDictionary_1 = require("../NDictionary");
class Channel {
    constructor(localState, options = {}) {
        this.entities = new NDictionary_1.NDictionary();
        this.entityNids = [];
        this.membershipVersion = 0;
        this.deltaBaseVersion = 0;
        this.createdRoots = [];
        this.deletedNids = [];
        this.broadcastMessages = [];
        this.users = new Map();
        this.historian = null;
        this.header = null;
        this.headerVersion = 0;
        this.visibleNetworkedNidsCache = null;
        this.localState = localState;
        this.nid = localState.nextNetworkId();
        this.label = options.label;
        if (options.historian) {
            this.historian = options.historian;
        }
        this.localState.channels.add(this);
        if (options.header) {
            this.setHeader(options.header);
        }
    }
    tick(tick) {
        if (this.historian !== null) {
            this.historian.record(tick, this.entities);
        }
    }
    beginDelta() {
        if (this.createdRoots.length === 0 && this.deletedNids.length === 0) {
            this.deltaBaseVersion = this.membershipVersion;
        }
    }
    addEntity(entity) {
        this.beginDelta();
        this.localState.registerEntity(entity, this.nid);
        this.entities.add(entity);
        this.entityNids.push(entity.nid);
        this.createdRoots.push(entity);
        this.membershipVersion++;
        return entity;
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
    removeEntity(entity) {
        const nid = entity.nid;
        if (this.entities.get(nid) !== entity) {
            return 0;
        }
        this.beginDelta();
        const createdIndex = this.createdRoots.findIndex(created => created.nid === nid);
        if (createdIndex > -1) {
            this.createdRoots.splice(createdIndex, 1);
        }
        else {
            this.localState.collectEntityTreeDeletes(nid, this.deletedNids);
        }
        this.entities.remove(entity);
        this.localState.unregisterEntity(entity, this.nid);
        const index = this.entityNids.indexOf(nid);
        if (index > -1) {
            this.entityNids.splice(index, 1);
        }
        this.membershipVersion++;
        return nid;
    }
    markDirty(entity) {
        return this.localState.markDirty(entity);
    }
    addMessage(message) {
        this.broadcastMessages.push(message);
    }
    clearBroadcastMessages() {
        this.broadcastMessages.length = 0;
    }
    clearSnapshotDeltas() {
        this.createdRoots.length = 0;
        this.deletedNids.length = 0;
        this.deltaBaseVersion = this.membershipVersion;
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
    removeAllEntities() {
        Array.from(this.entities.array).forEach(entity => this.removeEntity(entity));
        this.entityNids = [];
    }
    getVisibleEntities(userId) {
        // Plain channels are all-visible; returning the maintained nid list
        // avoids rebuilding identical arrays for every subscribed user.
        return this.entityNids;
    }
    getVisibleNetworkedNids(userId) {
        const entityTreeVersion = this.localState.entityTreeVersion;
        const cached = this.visibleNetworkedNidsCache;
        if (cached &&
            cached.membershipVersion === this.membershipVersion &&
            cached.entityTreeVersion === entityTreeVersion) {
            return cached.nids;
        }
        // Return a versioned snapshot, not the mutable entityNids array. A
        // same-length remove+add must produce a fresh ref so User visibility
        // cannot mistake the new membership for stable updates.
        const nids = [];
        if (entityTreeVersion === 0) {
            for (let i = 0; i < this.entityNids.length; i++) {
                nids.push(this.entityNids[i]);
            }
        }
        else {
            for (let i = 0; i < this.entityNids.length; i++) {
                this.localState.collectEntityTree(this.entityNids[i], nids);
            }
        }
        this.visibleNetworkedNidsCache = {
            membershipVersion: this.membershipVersion,
            entityTreeVersion,
            nids
        };
        return nids;
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
    }
}
exports.Channel = Channel;
