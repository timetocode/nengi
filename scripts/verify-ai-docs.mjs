import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
    '../nengi-uws-instance-adapter/package.json'
]
const errors = []

for (const relative of adapterPackages) {
    const packagePath = path.resolve(root, relative)
    const packageJson = readJson(packagePath)
    if (packageJson.version !== corePackage.version) {
        errors.push(`${relative} version ${packageJson.version} does not match nengi ${corePackage.version}`)
    }
    if (packageJson.peerDependencies?.nengi && packageJson.peerDependencies.nengi !== corePackage.version) {
        errors.push(`${relative} peer dependency does not exactly match nengi ${corePackage.version}`)
    }
}

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
const publishedGuidance = [rootReadme, ...markdownFiles.map(file => fs.readFileSync(path.join(docsDir, file), 'utf8'))]
for (const content of publishedGuidance) {
    if (/\bexamples?\b/i.test(content)) {
        errors.push('published guidance mentions unsupported repository examples')
        break
    }
}
if (corePackage.files?.some(file => /examples?/i.test(file))) {
    errors.push('package files unexpectedly include an examples path')
}
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

const markdown = [aiReadme, ...markdownFiles.map(file => fs.readFileSync(path.join(docsDir, file), 'utf8'))]
const relativeLinks = markdown.flatMap(content => [...content.matchAll(/\]\(\.(\/[^)#]+)(?:#[^)]+)?\)/g)].map(match => match[1]))
for (const relative of relativeLinks) {
    const target = path.resolve(docsDir, relative.slice(1))
    if (!fs.existsSync(target)) {
        errors.push(`AI docs link points to missing file ${relative}`)
    }
}

if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
}

console.log(`AI docs verified for nengi ${corePackage.version}: ${markdownFiles.length} markdown files, ${adapterPackages.length} official packages.`)
