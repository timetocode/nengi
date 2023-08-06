'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const Outbound_1 = require('./Outbound')
test('commands are queued in order', () => {
    var _a, _b, _c
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }
    const thirdCommand = { ntype: 1, content: 'third command' }
    const out = new Outbound_1.Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)
    out.addCommand(thirdCommand)
    expect((_a = out.outboundCommands.get(0)) === null || _a === void 0 ? void 0 : _a.dequeue()).toBe(firstCommand)
    expect((_b = out.outboundCommands.get(0)) === null || _b === void 0 ? void 0 : _b.dequeue()).toBe(secondCommand)
    expect((_c = out.outboundCommands.get(0)) === null || _c === void 0 ? void 0 : _c.dequeue()).toBe(thirdCommand)
})
test('multiple frames of commands can be queued', () => {
    var _a, _b, _c
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }
    const thirdCommand = { ntype: 1, content: 'third command' }
    const out = new Outbound_1.Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)
    out.tick = 1
    out.addCommand(thirdCommand)
    expect((_a = out.outboundCommands.get(0)) === null || _a === void 0 ? void 0 : _a.dequeue()).toBe(firstCommand)
    expect((_b = out.outboundCommands.get(0)) === null || _b === void 0 ? void 0 : _b.dequeue()).toBe(secondCommand)
    // this next command will be associated with tick 1 instead of tick 0
    expect((_c = out.outboundCommands.get(1)) === null || _c === void 0 ? void 0 : _c.dequeue()).toBe(thirdCommand)
})
test('command confirmation', () => {
    var _a, _b
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }
    const out = new Outbound_1.Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)
    // we expect the unconfirmed commands to exist
    // these happen to be in reverse order when converted to an array b/c of the underlying data strcuture
    // but this is an implementation detail that doesn't matter unless this datastructure changes later
    // maybe this test could be a little more resilient
    expect((_a = out.unconfirmedCommands.get(0)) === null || _a === void 0 ? void 0 : _a.arr).toStrictEqual([
        secondCommand,
        firstCommand
    ])
    // then we confirm that tick (and all the commands in it)
    // this is pretending that the server said that tick 0 is confirmed
    out.confirmCommands(0)
    // now we expect it to be undefined
    expect((_b = out.unconfirmedCommands.get(0)) === null || _b === void 0 ? void 0 : _b.arr).toBe(undefined)
})
//# sourceMappingURL=Outbound.xtest.js.map