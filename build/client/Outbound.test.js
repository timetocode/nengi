"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Outbound_1 = require("./Outbound");
test('commands are queued in order', () => {
    var _a, _b, _c;
    const firstCommand = { ntype: 1, content: 'first command' };
    const secondCommand = { ntype: 1, content: 'second command' };
    const thirdCommand = { ntype: 1, content: 'third command' };
    const out = new Outbound_1.Outbound();
    out.addCommand(firstCommand);
    out.addCommand(secondCommand);
    out.addCommand(thirdCommand);
    expect((_a = out.outboundCommands.get(0)) === null || _a === void 0 ? void 0 : _a[0]).toBe(firstCommand);
    expect((_b = out.outboundCommands.get(0)) === null || _b === void 0 ? void 0 : _b[1]).toBe(secondCommand);
    expect((_c = out.outboundCommands.get(0)) === null || _c === void 0 ? void 0 : _c[2]).toBe(thirdCommand);
});
test('commands are removed after flush', () => {
    var _a, _b, _c;
    const firstCommand = { ntype: 1, content: 'first command' };
    const secondCommand = { ntype: 1, content: 'second command' };
    const thirdCommand = { ntype: 1, content: 'third command' };
    const out = new Outbound_1.Outbound();
    out.addCommand(firstCommand);
    out.addCommand(secondCommand);
    out.addCommand(thirdCommand);
    expect((_a = out.outboundCommands.get(0)) === null || _a === void 0 ? void 0 : _a[0]).toBe(firstCommand);
    expect((_b = out.outboundCommands.get(0)) === null || _b === void 0 ? void 0 : _b[1]).toBe(secondCommand);
    expect((_c = out.outboundCommands.get(0)) === null || _c === void 0 ? void 0 : _c[2]).toBe(thirdCommand);
    out.flush();
    expect(out.outboundCommands.size).toBe(0);
});
test('multiple frames of commands can be queued', () => {
    var _a, _b, _c;
    const firstCommand = { ntype: 1, content: 'first command' };
    const secondCommand = { ntype: 1, content: 'second command' };
    const thirdCommand = { ntype: 1, content: 'third command' };
    const out = new Outbound_1.Outbound();
    out.addCommand(firstCommand);
    out.addCommand(secondCommand);
    out.tick = 1;
    out.addCommand(thirdCommand);
    expect((_a = out.outboundCommands.get(0)) === null || _a === void 0 ? void 0 : _a[0]).toBe(firstCommand);
    expect((_b = out.outboundCommands.get(0)) === null || _b === void 0 ? void 0 : _b[1]).toBe(secondCommand);
    expect((_c = out.outboundCommands.get(1)) === null || _c === void 0 ? void 0 : _c[0]).toBe(thirdCommand);
});
test('command confirmation', () => {
    const firstCommand = { ntype: 1, content: 'first command' };
    const secondCommand = { ntype: 1, content: 'second command' };
    const out = new Outbound_1.Outbound();
    out.addCommand(firstCommand);
    out.addCommand(secondCommand);
    expect(out.unconfirmedCommands.get(0)).toStrictEqual([
        firstCommand,
        secondCommand
    ]);
    out.confirmCommands(0);
    expect(out.unconfirmedCommands.get(0)).toBe(undefined);
});
test('engine commands are added correctly', () => {
    var _a;
    const engineCommand = { ntype: 2, content: 'engine command' };
    const out = new Outbound_1.Outbound();
    out.addEngineCommand(engineCommand);
    expect((_a = out.outboundEngineCommands.get(0)) === null || _a === void 0 ? void 0 : _a[0]).toBe(engineCommand);
});
test('getCurrentFrame returns current frame commands', () => {
    const command = { ntype: 1, content: 'command' };
    const engineCommand = { ntype: 2, content: 'engine command' };
    const out = new Outbound_1.Outbound();
    out.addCommand(command);
    out.addEngineCommand(engineCommand);
    const frame = out.getCurrentFrame();
    expect(frame.outboundCommands[0]).toBe(command);
    expect(frame.outboundEngineCommands[0]).toBe(engineCommand);
});
test('getEngineCommands returns engine commands for a given tick', () => {
    const engineCommand = { ntype: 2, content: 'engine command' };
    const out = new Outbound_1.Outbound();
    out.addEngineCommand(engineCommand);
    expect(out.getEngineCommands(0)[0]).toBe(engineCommand);
    expect(out.getEngineCommands(1)).toEqual([]);
});
test('getCommands returns commands for a given tick', () => {
    const command = { ntype: 1, content: 'command' };
    const out = new Outbound_1.Outbound();
    out.addCommand(command);
    expect(out.getCommands(0)[0]).toBe(command);
    expect(out.getCommands(1)).toEqual([]);
});
test('getUnconfirmedCommands returns all unconfirmed commands', () => {
    var _a, _b;
    const command1 = { ntype: 1, content: 'command 1' };
    const command2 = { ntype: 1, content: 'command 2' };
    const out = new Outbound_1.Outbound();
    out.addCommand(command1);
    out.tick = 1;
    out.addCommand(command2);
    const unconfirmed = out.getUnconfirmedCommands();
    expect((_a = unconfirmed.get(0)) === null || _a === void 0 ? void 0 : _a[0]).toBe(command1);
    expect((_b = unconfirmed.get(1)) === null || _b === void 0 ? void 0 : _b[0]).toBe(command2);
});
