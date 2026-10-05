// Copied beside the packed starter by test-starter.mjs. Exercise its real shell
// and presentation functions rather than restating its networking in a fixture.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { AdaptiveInterpolator, Client } from 'nengi'
import { WebSocketClientAdapter } from 'nengi-websocket-client-adapter'
import { startServer } from './server.ts'
import { createPresentation, updatePresentation } from './client-state.ts'
import { createContext, NType, SERVER_TICK_RATE } from './protocol.ts'

test('packed starter: two real clients, movement, validation, departure and a fresh session', { timeout: 20000 }, async () => {
    const server = await startServer()
    function session() {
        const client = new Client(createContext(), WebSocketClientAdapter, SERVER_TICK_RATE)
        return { client, interpolator: new AdaptiveInterpolator(client), presentation: createPresentation() }
    }
    const sessions = [session(), session()]
    const [first, second] = sessions
    async function until(predicate: () => boolean) {
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
            for (const current of sessions) {
                if (current.client.connectionState === 'connected') {
                    updatePresentation(current.client, current.interpolator, current.presentation)
                }
            }
            if (predicate()) return
            await delay(10)
        }
        assert.fail('Starter did not reach the expected replicated state')
    }

    try {
        await Promise.all(sessions.map(({ client }) => client.connect(`ws://127.0.0.1:${server.port}`)))
        await until(() => sessions.every(({ presentation }) => presentation.players.size === 2
            && presentation.controlledNid !== undefined))
        const nid = first.presentation.controlledNid!
        const local = first.presentation.players.get(nid)!
        const originalX = local.x
        const targetX = originalX + 90
        first.client.addCommand({ ntype: NType.MoveTo, x: targetX, y: local.y })
        first.client.flush()
        await until(() => Math.abs(local.x - targetX) < 0.1
            && Math.abs(second.presentation.players.get(nid)!.x - targetX) < 0.1)
        assert.notEqual(local.x, originalX, 'The controlled player must be interpolated too')
        assert.notEqual(local, first.client.network.store.get(nid), 'Presentation owns its values')
        assert.equal(first.client.network.store.get(nid)!.x, targetX)

        const [userId, player] = [...server.players].find(([, player]) => player.entity.nid === nid)!
        const invalidFrame = first.client.network.commandFrameNumber
        first.client.addCommand({ ntype: NType.MoveTo, x: NaN, y: 0 })
        first.client.flush()
        await until(() => server.instance.users.get(userId)!.lastReceivedCommandFrameNumber >= invalidFrame)
        const receivedAtTick = server.instance.tick
        await until(() => server.instance.tick >= receivedAtTick + 2)
        assert.equal(player.entity.x, targetX, 'Invalid input must not change authoritative position')
        assert.equal(player.entity.y, 250)
        // A following valid command proves the stream continues after rejecting invalid game input.
        first.client.addCommand({ ntype: NType.MoveTo, x: targetX + 18, y: local.y })
        first.client.flush()
        await until(() => Math.abs(local.x - targetX - 18) < 0.1)
        assert.equal(local.y, 250)

        first.client.disconnect()
        await until(() => second.presentation.players.size === 1 && server.players.size === 1)
        const rejoined = session()
        sessions.push(rejoined)
        await rejoined.client.connect(`ws://127.0.0.1:${server.port}`)
        await until(() => rejoined.presentation.controlledNid !== undefined
            && rejoined.presentation.players.size === 2 && second.presentation.players.size === 2)
        assert.equal(server.players.size, 2)

        // Server shutdown is also an observable session boundary for the remaining clients.
        await server.close()
        await until(() => sessions.every(({ client }) => client.connectionState === 'closed'))
    } finally {
        for (const { client } of sessions) client.disconnect()
        await server.close()
    }
})
