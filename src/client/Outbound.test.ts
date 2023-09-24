import { Outbound } from './Outbound'

test('commands are queued in order', () => {
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }
    const thirdCommand = { ntype: 1, content: 'third command' }

    const out = new Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)
    out.addCommand(thirdCommand)

    expect(out.outboundCommands.get(0)?.[0]).toBe(firstCommand)
    expect(out.outboundCommands.get(0)?.[1]).toBe(secondCommand)
    expect(out.outboundCommands.get(0)?.[2]).toBe(thirdCommand)
})

test('commands are removed after flush', () => {
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }
    const thirdCommand = { ntype: 1, content: 'third command' }

    const out = new Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)
    out.addCommand(thirdCommand)

    expect(out.outboundCommands.get(0)?.[0]).toBe(firstCommand)
    expect(out.outboundCommands.get(0)?.[1]).toBe(secondCommand)
    expect(out.outboundCommands.get(0)?.[2]).toBe(thirdCommand)

    out.flush()
    expect(out.outboundCommands.size).toBe(0)
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

    expect(out.outboundCommands.get(0)?.[0]).toBe(firstCommand)
    expect(out.outboundCommands.get(0)?.[1]).toBe(secondCommand)
    expect(out.outboundCommands.get(1)?.[0]).toBe(thirdCommand)
})

test('command confirmation', () => {
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }

    const out = new Outbound()
    out.addCommand(firstCommand)
    out.addCommand(secondCommand)

    expect(out.unconfirmedCommands.get(0)).toStrictEqual([
        firstCommand,
        secondCommand
    ])

    out.confirmCommands(0)

    expect(out.unconfirmedCommands.get(0)).toBe(undefined)
})

test('engine commands are added correctly', () => {
    const engineCommand = { ntype: 2, content: 'engine command' };

    const out = new Outbound()
    out.addEngineCommand(engineCommand)

    expect(out.outboundEngineCommands.get(0)?.[0]).toBe(engineCommand)
})

test('getCurrentFrame returns current frame commands', () => {
    const command = { ntype: 1, content: 'command' }
    const engineCommand = { ntype: 2, content: 'engine command' }

    const out = new Outbound()
    out.addCommand(command)
    out.addEngineCommand(engineCommand)

    const frame = out.getCurrentFrame()

    expect(frame.outboundCommands[0]).toBe(command)
    expect(frame.outboundEngineCommands[0]).toBe(engineCommand)
})

test('getEngineCommands returns engine commands for a given tick', () => {
    const engineCommand = { ntype: 2, content: 'engine command' }

    const out = new Outbound()
    out.addEngineCommand(engineCommand)

    expect(out.getEngineCommands(0)[0]).toBe(engineCommand)
    expect(out.getEngineCommands(1)).toEqual([])
})

test('getCommands returns commands for a given tick', () => {
    const command = { ntype: 1, content: 'command' }

    const out = new Outbound()
    out.addCommand(command)

    expect(out.getCommands(0)[0]).toBe(command)
    expect(out.getCommands(1)).toEqual([])
})

test('getUnconfirmedCommands returns all unconfirmed commands', () => {
    const command1 = { ntype: 1, content: 'command 1' }
    const command2 = { ntype: 1, content: 'command 2' }

    const out = new Outbound()
    out.addCommand(command1)
    out.tick = 1
    out.addCommand(command2)

    const unconfirmed = out.getUnconfirmedCommands()

    expect(unconfirmed.get(0)?.[0]).toBe(command1)
    expect(unconfirmed.get(1)?.[0]).toBe(command2)
})


