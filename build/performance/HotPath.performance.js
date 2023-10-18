"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const Channel_1 = require("../server/Channel");
const Instance_1 = require("../server/Instance");
const Context_1 = require("../common/Context");
const defineSchema_1 = require("../common/binary/schema/defineSchema");
const Binary_1 = require("../common/binary/Binary");
class User {
    constructor(localState) {
        this.id = 0;
        this.subscriptions = new Map();
        this.cache = {};
        this.cacheArr = [];
        this.localState = localState;
    }
    subscribe(channel) {
        this.subscriptions.set(channel.nid, channel);
    }
    unsubscribe(channel) {
        this.subscriptions.delete(channel.nid);
    }
    createOrUpdate(nid, tick, toCreate, toUpdate) {
        if (!this.cache[nid]) {
            toCreate.push(nid);
            this.cache[nid] = tick;
            this.cacheArr.push(nid);
        }
        else {
            this.cache[nid] = tick;
            toUpdate.push(nid);
        }
        const children = this.localState.children.get(nid);
        if (children) {
            //const cb = (cid: number) => this.createOrUpdate(cid, tick, toCreate, toUpdate)
            for (const cid of children) {
                this.createOrUpdate(cid, tick, toCreate, toUpdate);
            }
            //children.forEach(cb)
        }
    }
    checkVisibility(tick) {
        const toCreate = [];
        const toUpdate = [];
        const toDelete = [];
        for (const [channelId, channel] of this.subscriptions.entries()) {
            const visibleNids = channel.getVisibileEntities(this.id);
            for (let i = 0; i < visibleNids.length; i++) {
                this.createOrUpdate(visibleNids[i], tick, toCreate, toUpdate);
            }
        }
        /*
        this.subscriptions.forEach(channel => {
            channel.getVisibileEntities(this.id).forEach(nid => {
                this.createOrUpdate(nid, tick, toCreate, toUpdate)
            })
        })
        */
        for (let i = this.cacheArr.length - 1; i > -1; i--) {
            const id = this.cacheArr[i];
            if (this.cache[id] !== tick) {
                toDelete.push(id);
                this.cache[id] = 0;
                this.cacheArr.splice(i, 1);
            }
        }
        return { toDelete, toUpdate, toCreate };
    }
}
exports.User = User;
const getVisibleState = (user, instance) => {
    const { toCreate, toUpdate, toDelete } = user.checkVisibility(instance.tick);
    const createEntities = [];
    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i];
        const entity = instance.localState.getByNid(nid);
        const nschema = instance.context.getSchema(entity.ntype);
        if (nschema) {
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema);
            }
            createEntities.push(entity);
        }
        else {
            throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`);
        }
    }
    //const engineMessages = user.engineMessageQueue
    // user.engineMessageQueue = []
    //const messages = user.messageQueue
    // empty the queue
    //user.messageQueue = []
    const deleteEntities = toDelete;
    const updateEntities = [];
    for (let i = 0; i < toUpdate.length; i++) {
        const nid = toUpdate[i];
        const entity = instance.localState.getByNid(nid);
        const nschema = instance.context.getSchema(entity.ntype);
        const diffs = instance.cache.getChangedProperties(instance.tick, entity, nschema);
        for (let j = 0; j < diffs.length; j++) {
            updateEntities.push(diffs[j]);
        }
    }
    return {
        createEntities,
        updateEntities,
        deleteEntities,
        //   messages,
        //   engineMessages
    };
};
const NType = {
    NULL: 0,
    Channel: 1,
    TestEntity: 2,
};
const ncontext = new Context_1.Context();
ncontext.register(NType.Channel, (0, defineSchema_1.defineSchema)({}));
ncontext.register(NType.TestEntity, (0, defineSchema_1.defineSchema)({
    x: Binary_1.Binary.Float64,
    y: Binary_1.Binary.Float64
}));
const users = new Map();
const entities = new Map();
const instance = new Instance_1.Instance(ncontext);
const main = new Channel_1.Channel(instance.localState, NType.Channel);
for (let i = 0; i < 500; i++) {
    const entity = { nid: 0, ntype: NType.TestEntity, x: 500, y: 500 };
    main.addEntity(entity);
    entities.set(entity.nid, entity);
}
for (let i = 0; i < 500; i++) {
    const user = new User(instance.localState);
    user.id = i + 1;
    main.subscribe(user);
    users.set(user.id, user);
}
function hot() {
    // mutation of game state to create work
    entities.forEach(entity => {
        entity.x += 0.001;
        entity.y += 0.001;
    });
    // instance tick logic, subset
    instance.tick++;
    instance.cache.createCachesForTick(instance.tick);
    const start = performance.now();
    users.forEach(user => {
        getVisibleState(user, instance);
    });
    const stop = performance.now();
    console.log(`hot finished in ${stop - start} ms`);
    instance.cache.deleteCachesForTick(instance.tick);
}
setInterval(() => {
    hot();
}, 500);
