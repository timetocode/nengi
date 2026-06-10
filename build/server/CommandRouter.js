"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRouter = void 0;
const NetworkEvent_1 = require("../common/binary/NetworkEvent");
class CommandRouter {
    constructor() {
        this.handlers = new Map();
        this.unhandled = null;
    }
    on(ntype, handler) {
        const handlers = this.handlers.get(ntype) || [];
        handlers.push(handler);
        this.handlers.set(ntype, handlers);
        return this;
    }
    onUnhandled(handler) {
        this.unhandled = handler;
        return this;
    }
    process(event) {
        var _a, _b, _c, _d;
        if (event.type === NetworkEvent_1.NetworkEvent.CommandSet) {
            const commands = Array.isArray(event.commands) ? event.commands : [];
            for (let i = 0; i < commands.length; i++) {
                this.processCommand(event.user, commands[i], event, (_a = event.clientTick) !== null && _a !== void 0 ? _a : -1, (_b = event.commandTimings) === null || _b === void 0 ? void 0 : _b[i]);
            }
            return commands.length;
        }
        if (event.type === NetworkEvent_1.NetworkEvent.Command && event.commands) {
            this.processCommand(event.user, event.commands, event, (_c = event.clientTick) !== null && _c !== void 0 ? _c : -1, (_d = event.commandTimings) === null || _d === void 0 ? void 0 : _d[0]);
            return 1;
        }
        return 0;
    }
    processCommand(user, command, event, clientTick = -1, timing) {
        var _a;
        const ntype = command === null || command === void 0 ? void 0 : command.ntype;
        const handlers = typeof ntype === 'number' ? this.handlers.get(ntype) : undefined;
        if (!handlers || handlers.length === 0) {
            (_a = this.unhandled) === null || _a === void 0 ? void 0 : _a.call(this, { user, command, event, clientTick, timing });
            return false;
        }
        for (let i = 0; i < handlers.length; i++) {
            handlers[i]({ user, command, event, clientTick, timing });
        }
        return true;
    }
}
exports.CommandRouter = CommandRouter;
