import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoots = [
    coreRoot,
    path.resolve(coreRoot, '../nengi-buffers'),
    path.resolve(coreRoot, '../nengi-dataviews'),
    path.resolve(coreRoot, '../nengi-ws-instance-adapter'),
    path.resolve(coreRoot, '../nengi-uws-instance-adapter'),
    path.resolve(coreRoot, '../nengi-ws-client-adapter'),
    path.resolve(coreRoot, '../nengi-websocket-client-adapter')
]

for (const packageRoot of packageRoots) {
    const result = spawnSync('npm', ['run', 'build'], {
        cwd: packageRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}
