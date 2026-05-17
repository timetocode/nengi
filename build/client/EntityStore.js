"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityStore = void 0;
const BinaryExt_1 = require("../common/binary/BinaryExt");
const Frame_1 = require("./Frame");
function cloneEntity(entity) {
    return Object.assign({}, entity);
}
class EntityStore {
    constructor(context) {
        this.entities = new Map();
        this.ntypes = new Map();
        this.context = context;
    }
    get(nid) {
        return this.entities.get(nid);
    }
    getByNType(ntype) {
        return Array.from(this.entities.values()).filter(entity => entity.ntype === ntype);
    }
    getWhere(prop, value) {
        return Array.from(this.entities.values()).filter(entity => entity[prop] === value);
    }
    applySnapshot(snapshot, tick) {
        const createEntities = [];
        const updateEntities = [];
        const deleteEntities = [];
        const deletedEntities = [];
        snapshot.deleteEntities.forEach(nid => {
            const previous = this.entities.get(nid);
            this.entities.delete(nid);
            this.ntypes.delete(nid);
            deleteEntities.push(nid);
            deletedEntities.push({
                nid,
                entity: previous ? cloneEntity(previous) : undefined
            });
        });
        snapshot.createEntities.forEach(entity => {
            const stored = cloneEntity(entity);
            this.entities.set(stored.nid, stored);
            this.ntypes.set(stored.nid, stored.ntype);
            createEntities.push(cloneEntity(stored));
        });
        snapshot.updateEntities.forEach(update => {
            const entity = this.entities.get(update.nid);
            if (!entity) {
                return;
            }
            const nschema = this.context.getSchema(entity.ntype);
            const propData = nschema.props[update.prop];
            const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
            const previous = binaryUtil.clone(entity[update.prop]);
            const value = binaryUtil.clone(update.value);
            entity[update.prop] = binaryUtil.clone(update.value);
            updateEntities.push({
                nid: update.nid,
                prop: update.prop,
                previous,
                value
            });
        });
        return new Frame_1.Frame({
            tick,
            timestamp: snapshot.timestamp,
            confirmedClientTick: snapshot.confirmedClientTick,
            createEntities,
            updateEntities,
            deleteEntities,
            deletedEntities,
            messages: snapshot.messages.slice()
        });
    }
}
exports.EntityStore = EntityStore;
