import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import {
    prepareFamily, buildFamily, packPackages, installArtifacts,
    verifyArtifacts, finishFamily, run
} from './package-family.mjs'

function checkConsumer(family, artifacts, name) {
    console.log(`\nAdapter compatibility: ${name}`)
    const consumer = path.join(family.temporaryRoot, name)
    installArtifacts(artifacts, consumer)
    const tests = ['test-family-connections.cjs', 'test-family-binary.cjs']
    for (const file of tests) fs.copyFileSync(new URL(file, import.meta.url), path.join(consumer, file))
    run(process.execPath, ['--test', ...tests], consumer)
    const api = path.join(consumer, 'test-adapter-api.ts')
    fs.copyFileSync(new URL('./test-adapter-api.ts', import.meta.url), api)
    run(process.execPath, [path.join(family.packages[0].source, 'node_modules/typescript/bin/tsc'),
        '--strict', '--target', 'es2020', '--module', 'node16', '--moduleResolution', 'node16', '--outDir', 'compiled', api], consumer)
    run(process.execPath, [path.join(consumer, 'compiled/test-adapter-api.js')], consumer)
    // Exercise native backends from installed artifacts as well. Copy only the
    // smoke harness; neither Bun nor Deno compiles or substitutes adapter source.
    for (const runtime of ['bun', 'deno']) {
        const pkg = family.packages.find(pkg => pkg.name === `nengi-${runtime}-instance-adapter`)
        const test = fs.readFileSync(path.join(pkg.root, 'test/native-smoke.ts'), 'utf8')
            .replaceAll('../build/index.js', pkg.name).replaceAll('../src/index.ts', pkg.name)
        const file = `${runtime}-smoke.ts`
        fs.writeFileSync(path.join(consumer, file), test)
        run(runtime, runtime === 'bun' ? ['run', file] : ['run', '--allow-net', '--allow-read', file], consumer)
    }
    verifyArtifacts(artifacts, consumer)
    return { name, packages: artifacts.map(({ name, version, integrity }) => ({ name, version, integrity })), passed: true }
}

export function testCompatibility(family, current) {
    const directory = fileURLToPath(new URL('./compatibility-baseline/', import.meta.url))
    const baseline = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
    const frozen = baseline.artifacts.map(artifact => ({ ...artifact, file: path.join(directory, artifact.file) }))
    const core = current.find(artifact => artifact.name === 'nengi')
    const minimum = frozen.find(artifact => artifact.name === 'nengi')
    const reports = [
        checkConsumer(family, [core, ...frozen.filter(artifact => artifact.name !== 'nengi')], 'current-core-frozen-adapters'),
        checkConsumer(family, [minimum, ...current.filter(artifact => artifact.name !== 'nengi')], 'minimum-core-current-adapters')
    ]
    if (core.version === minimum.version && semver.prerelease(core.version)?.[0] === 'rc') {
        // The initial baseline has no later real core yet. Explicitly prove that
        // npm accepts version skew by changing only a temporary core manifest.
        // This is a packaging probe, not evidence about future engine changes.
        const original = family.packages[0]
        const root = path.join(family.temporaryRoot, 'version-probe-core')
        fs.mkdirSync(root)
        for (const item of ['package.json', 'README.md', 'LICENSE', 'build', 'docs']) {
            if (fs.existsSync(path.join(original.root, item))) fs.cpSync(path.join(original.root, item), path.join(root, item), { recursive: true })
        }
        const manifest = { ...original.manifest, version: semver.inc(core.version, 'prerelease', 'rc') }
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
        const [probe] = packPackages([{ name: 'nengi', root, manifest }], path.join(family.temporaryRoot, 'version-probe-tarballs'))
        reports.push(checkConsumer(family, [probe, ...frozen.filter(artifact => artifact.name !== 'nengi')], 'synthetic-version-skew-probe'))
    }
    fs.writeFileSync(path.join(family.temporaryRoot, 'compatibility.json'), JSON.stringify({ provenance: baseline.provenance, reports }, null, 2) + '\n')
    console.log('Frozen-artifact compatibility checks passed. No adapter sources were rebuilt in the consumer checks.')
    return reports
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const family = prepareFamily()
    let success = false
    try {
        buildFamily(family)
        testCompatibility(family, packPackages(family.packages, path.join(family.temporaryRoot, 'tarballs')))
        success = true
    } finally {
        finishFamily(family, success)
    }
}
