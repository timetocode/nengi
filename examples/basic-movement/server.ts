import { WsInstanceAdapter } from 'nengi-ws-instance-adapter'
import { createGame } from './game.ts'
import { SERVER_TICK_RATE } from './protocol.ts'

export async function startServer(port = 0) {
    const game = createGame()
    const adapter = new WsInstanceAdapter(game.instance.adapterHost)

    try {
        await new Promise<void>((resolve, reject) => {
            adapter.listen({ port, host: '127.0.0.1' }, () => {
                adapter.server!.removeListener('error', reject)
                resolve()
            })
            adapter.server!.once('error', reject)
        })
    } catch (error) {
        await adapter.shutdown('listen_failed').finally(() => game.dispose())
        throw error
    }
    const address = adapter.server!.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener')

    let closing: Promise<void> | undefined
    function close() {
        if (!closing) {
            clearInterval(timer)
            closing = adapter.shutdown('server_stopped').finally(() => game.dispose())
        }
        return closing
    }

    const timer = setInterval(() => {
        try {
            game.tick()
        } catch (error) {
            // A failed snapshot step retires this instance; do not keep stepping it.
            console.error(error)
            void close().catch(console.error)
        }
    }, 1000 / SERVER_TICK_RATE)

    return { ...game, adapter, port: address.port, close }
}
