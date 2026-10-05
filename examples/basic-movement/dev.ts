import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startServer } from './server.ts'

export async function startDemo(port = 5173) {
    const game = await startServer()
    let vite: ViteDevServer | undefined
    try {
        vite = await createServer({
            root: fileURLToPath(new URL('.', import.meta.url)),
            server: {
                host: '127.0.0.1',
                port,
                proxy: { '/game': { target: `ws://127.0.0.1:${game.port}`, ws: true } }
            }
        })
        await vite.listen()
    } catch (error) {
        await vite?.close()
        await game.close()
        throw error
    }

    const server = vite
    async function close() {
        await game.close()
        await server.close()
    }

    return { game, vite: server, close }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const demo = await startDemo()
    demo.vite.printUrls()
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            void demo.close().catch(error => {
                console.error(error)
                process.exitCode = 1
            })
        })
    }
}
