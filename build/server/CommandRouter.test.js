"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const NetworkEvent_1 = require("../common/binary/NetworkEvent");
const CommandRouter_1 = require("./CommandRouter");
describe('CommandRouter', () => {
    it('dispatches command sets by ntype in order', () => {
        const router = new CommandRouter_1.CommandRouter();
        const events = [];
        const user = { id: 7 };
        router.on(1, ({ user, command, clientTick }) => {
            events.push(`${user.id}:${clientTick}:${command.value}`);
        });
        router.on(2, ({ command }) => {
            events.push(`two:${command.value}`);
        });
        const count = router.process({
            type: NetworkEvent_1.NetworkEvent.CommandSet,
            user,
            clientTick: 123,
            commands: [
                { ntype: 1, value: 'a' },
                { ntype: 2, value: 'b' },
                { ntype: 1, value: 'c' }
            ]
        });
        expect(count).toBe(3);
        expect(events).toEqual([
            '7:123:a',
            'two:b',
            '7:123:c'
        ]);
    });
    it('can report unhandled commands', () => {
        const router = new CommandRouter_1.CommandRouter();
        const unhandled = [];
        router.onUnhandled(({ command }) => {
            unhandled.push(command.ntype);
        });
        router.process({
            type: NetworkEvent_1.NetworkEvent.CommandSet,
            user: { id: 1 },
            clientTick: 1,
            commands: [
                { ntype: 9 }
            ]
        });
        expect(unhandled).toEqual([9]);
    });
    it('passes per-command timing metadata to handlers', () => {
        const router = new CommandRouter_1.CommandRouter();
        const received = [];
        const timing = {
            commandIndex: 1,
            clientTimeMs: 10,
            renderDelayMs: 100,
            viewTick: 2.5,
            viewServerTimeMs: 1000.5,
            serverReceivedTimeMs: 20,
            estimatedInputTimeMs: 15,
            estimatedViewTimeMs: -85,
            estimatedInputAgeMs: 5,
            estimatedViewAgeMs: 105,
            roundTripMs: 8,
            oneWayMs: 4,
            clockOffsetMs: 5,
            clockSyncSamples: 2
        };
        router.on(1, ({ timing }) => {
            var _a;
            received.push((_a = timing === null || timing === void 0 ? void 0 : timing.estimatedInputTimeMs) !== null && _a !== void 0 ? _a : -1);
        });
        router.process({
            type: NetworkEvent_1.NetworkEvent.CommandSet,
            user: { id: 1 },
            clientTick: 1,
            commands: [
                { ntype: 1 },
                { ntype: 1 }
            ],
            commandTimings: [
                undefined,
                timing
            ]
        });
        expect(received).toEqual([-1, 15]);
    });
});
