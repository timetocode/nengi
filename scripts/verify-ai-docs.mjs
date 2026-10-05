import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { validateFamily } from './package-policy.mjs'
import { checkPublicDocs } from './check-public-docs.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = path.join(root, 'docs', 'ai')

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8')
}

const corePackage = readJson(path.join(root, 'package.json'))
const adapterPackages = [
    '../nengi-dataviews/package.json',
    '../nengi-buffers/package.json',
    '../nengi-websocket-client-adapter/package.json',
    '../nengi-ws-client-adapter/package.json',
    '../nengi-ws-instance-adapter/package.json',
    '../nengi-uws-instance-adapter/package.json',
    '../nengi-bun-instance-adapter/package.json',
    '../nengi-deno-instance-adapter/package.json'
]
const errors = []

errors.push(...validateFamily([corePackage, ...adapterPackages.map(relative => readJson(path.resolve(root, relative)))]))

const rootReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
const aiReadme = read('docs/ai/README.md')
const adapters = read('docs/ai/adapters.md')
const primitives = read('docs/ai/networking-primitives.md')
const operations = read('docs/ai/operations.md')

if (!rootReadme.includes(`nengi@${corePackage.version}`)) {
    errors.push('root README does not show the pinned core install command')
}
if (!adapters.includes(`nengi@${corePackage.version}`)) {
    errors.push('adapter docs do not show the pinned core install command')
}
for (const required of [
    'instance.processRequests(100)',
    'context.registerEndpoint(OpenChest)'
]) {
    if (!primitives.includes(required)) {
        errors.push(`networking primitives docs are missing ${required}`)
    }
}
for (const required of ['client.network.sendSchemaFingerprint', 'RequestPolicy.Dedupe']) {
    if (!operations.includes(required)) {
        errors.push(`operations docs are missing ${required}`)
    }
}
for (const required of [
    'api-surface.md',
    'architecture-and-ticks.md',
    'benchmarking.md',
    'client-state.md',
    'ecs-world.md',
    'network-condition-simulation.md',
    'operations.md',
    'service-patterns.md',
    'testing-and-correctness.md',
    'timing-and-liveness.md'
]) {
    if (!aiReadme.includes(required)) {
        errors.push(`AI guide does not link ${required}`)
    }
}

const staleNames = ['ClientEntityMode', 'clientTick', 'GameEcsWorld']
const markdownFiles = fs.readdirSync(docsDir)
    .filter(file => file.endsWith('.md'))
if (fs.existsSync(path.join(docsDir, 'local-prototype.md'))) {
    errors.push('published AI docs unexpectedly include the removed local prototype guide')
}
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root, encoding: 'utf8', shell: process.platform === 'win32'
}))
const publishedFiles = new Set(packed.files.map(file => file.path))
const markdown = new Map([...publishedFiles].filter(file => file.endsWith('.md')).map(file => [file, read(file)]))
errors.push(...checkPublicDocs(publishedFiles, markdown))
for (const declaration of [
    'build/server/channel/EcsChannel.d.ts',
    'build/server/channel/EcsChannel2D.d.ts',
    'build/server/channel/EcsChannel3D.d.ts'
]) {
    const declarationPath = path.join(root, declaration)
    if (fs.existsSync(declarationPath)) {
        const content = fs.readFileSync(declarationPath, 'utf8')
        if (content.includes('appendBoundComponent')) {
            errors.push(`${declaration} exposes binding-only mutation hooks`)
        }
    }
}
for (const file of markdownFiles) {
    const content = fs.readFileSync(path.join(docsDir, file), 'utf8')
    for (const stale of staleNames) {
        if (content.includes(stale)) {
            errors.push(`docs/ai/${file} contains stale API name ${stale}`)
        }
    }
}

const apiSurface = read('docs/ai/api-surface.md')
const timing = read('docs/ai/timing-and-liveness.md')
for (const required of ['InstanceOptions', 'ClientOptions', 'TimeSource', 'WIRE_PROTOCOL_VERSION']) {
    if (!apiSurface.includes(required)) {
        errors.push(`API surface docs are missing ${required}`)
    }
}
for (const required of ['UserConnectionDenied', 'UserDisconnected', 'instance.step()']) {
    if (!timing.includes(required)) {
        errors.push(`timing docs are missing ${required}`)
    }
}

if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
}

console.log(`AI docs verified for nengi ${corePackage.version}: ${markdownFiles.length} markdown files, ${adapterPackages.length} official packages.`)
