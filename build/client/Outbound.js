"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Outbound = void 0;
// used for the first frames, never has anything in it
const emptyArr = [];
class Outbound {
    constructor() {
        this.unconfirmedCommands = new Map();
        this.outboundEngineCommands = new Map();
        this.outboundCommands = new Map();
        this.tick = 0;
        this.currentFrame = null;
        this.confirmedTick = -1;
        this.lastSentTick = -1;
    }
    getCurrentFrame() {
        const outboundEngineCommands = this.outboundEngineCommands.get(this.tick);
        const outboundCommands = this.outboundCommands.get(this.tick);
        return {
            outboundEngineCommands: (outboundEngineCommands) ? outboundEngineCommands : emptyArr,
            outboundCommands: (outboundCommands) ? outboundCommands : emptyArr,
        };
    }
    addEngineCommand(command) {
        const tick = this.tick;
        if (this.outboundEngineCommands.has(tick)) {
            this.outboundEngineCommands.get(tick).push(command);
        }
        else {
            this.outboundEngineCommands.set(tick, [command]);
        }
    }
    addCommand(command) {
        const tick = this.tick;
        if (this.outboundCommands.has(tick)) {
            this.outboundCommands.get(tick).push(command);
        }
        else {
            this.outboundCommands.set(tick, [command]);
        }
        if (!this.unconfirmedCommands.has(tick)) {
            this.unconfirmedCommands.set(tick, [command]);
        }
        else {
            this.unconfirmedCommands.get(tick).push(command);
        }
    }
    getEngineCommands(tick) {
        if (this.outboundEngineCommands.has(tick)) {
            return this.outboundEngineCommands.get(tick);
        }
        else {
            return emptyArr;
        }
    }
    getCommands(tick) {
        if (this.outboundCommands.has(tick)) {
            return this.outboundCommands.get(tick);
        }
        else {
            return emptyArr;
        }
    }
    confirmCommands(confirmedTick) {
        this.unconfirmedCommands.forEach((commandQueue, tick) => {
            if (tick <= confirmedTick) {
                this.unconfirmedCommands.delete(tick);
            }
        });
        this.confirmedTick = confirmedTick;
    }
    getUnconfirmedCommands() {
        return this.unconfirmedCommands;
    }
    flush() {
        this.outboundEngineCommands.clear();
        this.outboundCommands.clear();
    }
}
exports.Outbound = Outbound;
