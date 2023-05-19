// @ts-nocheck

import { Outbound } from './Outbound'

test('commands are queued in order', () => {
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }
    const thirdCommand = { ntype: 1, content: 'third command' }

    const out = new Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)
    out.addCommand(thirdCommand)

    expect(out.outboundCommands.get(0)?.dequeue()).toBe(firstCommand)
    expect(out.outboundCommands.get(0)?.dequeue()).toBe(secondCommand)
    expect(out.outboundCommands.get(0)?.dequeue()).toBe(thirdCommand)
})

test('multiple frames of commands can be queued', () => {
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }
    const thirdCommand = { ntype: 1, content: 'third command' }

    const out = new Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)
    out.tick = 1
    out.addCommand(thirdCommand)

    expect(out.outboundCommands.get(0)?.dequeue()).toBe(firstCommand)
    expect(out.outboundCommands.get(0)?.dequeue()).toBe(secondCommand)
    // this next command will be associated with tick 1 instead of tick 0
    expect(out.outboundCommands.get(1)?.dequeue()).toBe(thirdCommand)
})

test('command confirmation', () => {
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }

    const out = new Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)

    // we expect the unconfirmed commands to exist
    // these happen to be in reverse order when converted to an array b/c of the underlying data strcuture
    // but this is an implementation detail that doesn't matter unless this datastructure changes later
    // maybe this test could be a little more resilient
    expect(out.unconfirmedCommands.get(0)?.arr).toStrictEqual([
        secondCommand,
        firstCommand
    ])

    // then we confirm that tick (and all the commands in it)
    // this is pretending that the server said that tick 0 is confirmed
    out.confirmCommands(0)

    // now we expect it to be undefined
    expect(out.unconfirmedCommands.get(0)?.arr).toBe(undefined)
})