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

test('engine commands are added correctly', () => {
    const engineCommand = { ntype: 2, content: 'engine command' }

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

    out.tick++
    expect(out.getCurrentFrame()).toEqual({ outboundCommands: [], outboundEngineCommands: [] })
})

test('commands with timing keep command index metadata', () => {
    const firstCommand = { ntype: 1, content: 'first command' }
    const secondCommand = { ntype: 1, content: 'second command' }
    const thirdCommand = { ntype: 1, content: 'third command' }

    const out = new Outbound()
    out.addCommand(firstCommand)
    out.addCommandWithTiming(secondCommand, {
        clientTimeMs: 12.5,
        renderDelayMs: 100,
        viewTick: 3.25,
        viewServerTimeMs: 1000.5
    })
    out.addCommandWithTiming(thirdCommand, {
        clientTimeMs: 14,
        renderDelayMs: 80,
        viewTick: 4,
        viewServerTimeMs: 1050.5
    })

    expect(out.outboundCommands.get(0)).toEqual([
        firstCommand,
        secondCommand,
        thirdCommand
    ])
    expect(out.getCommandTiming(0)).toEqual([
        { commandIndex: 1, clientTimeMs: 12.5, renderDelayMs: 100, viewTick: 3.25, viewServerTimeMs: 1000.5 },
        { commandIndex: 2, clientTimeMs: 14, renderDelayMs: 80, viewTick: 4, viewServerTimeMs: 1050.5 }
    ])
    out.addEngineCommand({ ntype: 3 })
    out.flush()
    expect(out.getCurrentFrame()).toEqual({ outboundCommands: [], outboundEngineCommands: [] })
    expect(out.getCommandTiming(0)).toEqual([])
})
