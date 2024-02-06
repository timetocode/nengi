"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Historian = void 0;
const BinaryExt_1 = require("../common/binary/BinaryExt");
const util_1 = require("../common/binary/schema/util");
class Historian {
    constructor(context, tickRatePerSecond, ticksToStore) {
        this.history = {};
        this.tick = 0;
        this.ticksToStore = 0;
        this.context = context;
        this.tickRatePerSecond = tickRatePerSecond;
        // default value is 2 seconds worth of ticks
        this.ticksToStore = tickRatePerSecond * 2;
        if (ticksToStore) {
            // or use a user specified amount
            this.ticksToStore = ticksToStore;
        }
    }
    record(tick, entities) {
        const snapshot = new Map();
        for (let i = 0; i < entities.array.length; i++) {
            const entity = entities.array[i];
            snapshot.set(entity.nid, (0, util_1.copyNObject)(entity, this.context.getSchema(entity.ntype)));
        }
        this.history[tick] = snapshot;
        this.tick = tick;
        delete this.history[tick - (this.ticksToStore + 1)];
        /*
        let str = ''
        for (const prop in this.history) {
            str += `${prop}[${this.history[prop].size}]|`
        }
        console.log('historian states', str)
        */
    }
    /**
     * Gets past state of entities from the frame nearest the time requested, lower performance cost
     * @param millisecondsAgo
     * @returns Map<nid, IEntity>
     */
    getFastLagCompensatedState(millisecondsAgo) {
        const tickLengthMs = 1000 / this.tickRatePerSecond;
        const ticksAgo = millisecondsAgo / tickLengthMs;
        const olderTick = this.tick - Math.floor(ticksAgo);
        const newerTick = olderTick + 1;
        const portion = (millisecondsAgo % tickLengthMs) / tickLengthMs;
        const snapshotA = this.history[olderTick];
        const snapshotB = this.history[newerTick];
        return (portion >= 0.5) ? snapshotB : snapshotA;
    }
    /**
     * Gets past state of entities computed as a position between frames, moderate performance cost
     * @param millisecondsAgo
     * @returns Map<nid, IEntity>
     */
    getComputedLagCompensatedState(millisecondsAgo) {
        const tickLengthMs = 1000 / this.tickRatePerSecond;
        const ticksAgo = millisecondsAgo / tickLengthMs;
        const olderTick = this.tick - Math.floor(ticksAgo);
        const newerTick = olderTick + 1;
        const portion = (millisecondsAgo % tickLengthMs) / tickLengthMs;
        const snapshotA = this.history[olderTick];
        const snapshotB = this.history[newerTick];
        const snapshotC = new Map();
        if (snapshotA && snapshotB) {
            snapshotA.forEach((entityA, nid) => {
                const entityB = snapshotB.get(nid);
                if (entityA && entityB) {
                    const computed = { nid, ntype: entityA.ntype };
                    const nschema = this.context.getSchema(computed.ntype);
                    for (let i = 0; i < nschema.keys.length; i++) {
                        const { prop } = nschema.keys[i];
                        const binarySpec = nschema.props[prop];
                        const binaryUtil = (0, BinaryExt_1.binaryGet)(binarySpec.type);
                        const valueA = entityA[prop];
                        const valueB = entityB[prop];
                        if (binarySpec.interp) {
                            // interpolated
                            const value = binaryUtil.interp(valueA, valueB, portion);
                            computed[prop] = value;
                        }
                        else {
                            // not interpolated, go with with nearest state
                            // arguably this should always be valueA...
                            if (portion < 0.5) {
                                computed[prop] = valueA;
                            }
                            else {
                                computed[prop] = valueB;
                            }
                        }
                    }
                    snapshotC.set(nid, computed);
                }
            });
        }
        return snapshotC;
    }
}
exports.Historian = Historian;
