import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import { packageNames, parsePublishArgs, checkPublishedArtifact, registry } from './package-policy.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoots = packageNames.map(name => path.resolve(coreRoot, '..', name))

function commandEnvironment() {
    if (process.platform === 'win32') {
        return process.env
    }

    const env = {
        ...process.env,
        TMPDIR: '/tmp',
        npm_config_cache: process.env.npm_config_cache ?? '/tmp/nengi-npm-cache',
        NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? '/tmp/nengi-npm-cache'
    }
    try {
        if (/microsoft/i.test(readFileSync('/proc/version', 'utf8')) && !env.BROWSER) {
            env.BROWSER = path.join(coreRoot, 'scripts', 'open-windows-browser.mjs')
        }
    } catch {
        // Non-WSL Linux does not need the Windows browser bridge.
    }
    return env
}

const environment = commandEnvironment()

function run(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, {
        cwd: options.cwd ?? coreRoot,
        encoding: 'utf8',
        env: environment,
        stdio: options.capture ? 'pipe' : 'inherit',
        shell: process.platform === 'win32'
    })

    if (result.status !== 0 && !options.allowFailure) {
        if (options.capture) {
            process.stderr.write(result.stdout ?? '')
            process.stderr.write(result.stderr ?? '')
        }
        process.exit(result.status ?? 1)
    }

    return result
}

function readManifest(packageRoot) {
    return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
}

function assertClean(packageRoot, packageName) {
    const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: packageRoot,
        encoding: 'utf8'
    })
    if (status.trim()) {
        throw new Error(`${packageName} has uncommitted changes; commit them before publishing.`)
    }
}

function registryMetadata(packageSpec) {
    const result = run('npm', ['view', packageSpec, '--json', '--registry', registry], {
        capture: true,
        allowFailure: true
    })
    if (result.status === 0) return JSON.parse(result.stdout)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    if (/E404|is not in this registry|No match found/i.test(output)) return undefined
    throw new Error(output)
}

function npmWhoami() {
    return run('npm', ['whoami', '--registry', registry], {
        capture: true,
        allowFailure: true
    })
}

function ensureNpmAuthentication() {
    let result = npmWhoami()
    if (result.status === 0) {
        console.log(`Authenticated as ${result.stdout.trim()}.`)
        return
    }

    console.log('npm credentials are missing or expired. Starting npm web login...')
    run(process.execPath, ['scripts/npm-login.mjs'])

    result = npmWhoami()
    if (result.status !== 0) {
        process.stderr.write(result.stdout ?? '')
        process.stderr.write(result.stderr ?? '')
        throw new Error('npm login completed, but registry authentication still failed.')
    }
    console.log(`Authenticated as ${result.stdout.trim()}.`)
}

const packages = packageRoots.map(packageRoot => ({
    root: packageRoot,
    manifest: readManifest(packageRoot)
}))
const { entries, tag, dryRun } = parsePublishArgs(process.argv.slice(2), packages.map(entry => entry.manifest))
const selected = new Set(entries.map(entry => entry.name))

if (!dryRun) {
    for (const entry of packages) assertClean(entry.root, entry.manifest.name)
}

console.log(`Release set: ${entries.map(entry => `${entry.name}@${entry.version}`).join(', ')}`)
console.log(`Registry tag: ${tag}; mode: ${dryRun ? 'dry run' : 'publish'}`)
run('npm', ['run', 'release:check'])

// Publish the exact tarballs inspected here. A lifecycle hook during npm publish
// must not rebuild a different artifact after the compatibility checks.
const output = mkdtempSync(path.join(os.tmpdir(), 'nengi-publish-'))
const artifacts = packages.map(entry => {
    const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], {
        cwd: entry.root,
        capture: true
    }).stdout)[0]
    return { ...entry, integrity: packed.integrity, file: path.join(output, packed.filename) }
})
console.log(`Prepared artifacts: ${output}`)

// Preflight the entire tested combination before publishing anything. Unselected
// packages must already exist with these contents. An existing version is never
// silently skipped when local contents have changed.
for (const artifact of artifacts) {
    const { name, version } = artifact.manifest
    artifact.published = registryMetadata(`${name}@${version}`)
    const metadata = selected.has(name) ? registryMetadata(name) : undefined
    artifact.needsTag = checkPublishedArtifact(artifact, artifact.published, selected.has(name), tag, metadata?.['dist-tags']?.[tag])
}

if (!dryRun) {
    for (const entry of packages) assertClean(entry.root, entry.manifest.name)
    ensureNpmAuthentication()
}
for (const artifact of artifacts.filter(entry => selected.has(entry.manifest.name))) {
    const { name, version } = artifact.manifest
    const spec = `${name}@${version}`
    if (artifact.published) {
        if (artifact.needsTag) {
            console.log(`${dryRun ? 'Would tag' : 'Tagging'} unchanged ${spec} as ${tag}`)
            if (!dryRun) run('npm', ['dist-tag', 'add', spec, tag, '--registry', registry])
        } else console.log(`Verified already-published ${spec}; no changes needed.`)
    } else {
        console.log(`${dryRun ? 'Dry-running' : 'Publishing'} ${spec}`)
        run('npm', ['publish', artifact.file, '--ignore-scripts', '--tag', tag, '--registry', registry,
            ...(dryRun ? ['--dry-run'] : [])])
    }
}
console.log(`${dryRun ? 'Dry run completed' : 'Release completed'} for ${entries.length} selected packages.`)
