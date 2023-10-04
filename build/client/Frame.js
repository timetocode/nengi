"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frame = void 0;
class Frame {
    constructor(tick, snapshot, previousFrame) {
        this.processed = false; // whether create/deletes have been processed
        this.once = false; // whether this frame has been used for interpolation once
        this.entities = new Map();
        this.createEntities = [];
        this.updateEntities = [];
        this.deleteEntities = [];
        this.tick = tick;
        this.confirmedClientTick = snapshot.confirmedClientTick;
        this.timestamp = snapshot.timestamp;
        if (previousFrame) {
            previousFrame.entities.forEach(entity => {
                const clone = Object.assign({}, entity);
                this.entities.set(clone.nid, clone);
            });
        }
        snapshot.createEntities.forEach(entity => {
            const clone = Object.assign({}, entity);
            this.entities.set(clone.nid, clone);
            this.createEntities.push(clone);
        });
        snapshot.updateEntities.forEach(update => {
            const entity = this.entities.get(update.nid);
            entity[update.prop] = update.value;
            const clone = Object.assign({}, update);
            this.updateEntities.push(clone);
        });
        snapshot.deleteEntities.forEach(nid => {
            this.entities.delete(nid);
            this.deleteEntities.push(nid);
        });
    }
}
exports.Frame = Frame;
