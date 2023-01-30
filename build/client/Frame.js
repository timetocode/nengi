"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frame = void 0;
let tick = 0; // TODO this should be the server tick not a client based count
class Frame {
    constructor(snapshot, previousFrame) {
        this.tick = tick++;
        this.timestamp = performance.now();
        this.processed = false;
        this.entities = new Map();
        this.createEntities = [];
        this.updateEntities = [];
        this.deleteEntities = [];
        if (previousFrame) {
            // this.timestamp = previousFrame.timestamp + 50
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
            //console.log('a frame had an update', update)
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
