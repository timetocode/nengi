import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
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

const args = new Set(process.argv.slice(2))
const knownArgs = new Set(['--dry-run'])
for (const arg of args) {
    if (!knownArgs.has(arg)) {
        throw new Error(`Unknown argument: ${arg}`)
    }
}

const dryRun = args.has('--dry-run')
const tag = 'rc'

function run(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, {
        cwd: options.cwd ?? coreRoot,
        encoding: 'utf8',
        env: process.platform === 'win32'
            ? process.env
            : {
                ...process.env,
                TMPDIR: '/tmp',
                npm_config_cache: process.env.npm_config_cache ?? '/tmp/nengi-npm-cache',
                NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? '/tmp/nengi-npm-cache'
            },
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

function registryVersion(packageSpec) {
    const result = run('npm', ['view', packageSpec, 'version', '--json'], {
        capture: true,
        allowFailure: true
    })
    if (result.status === 0) {
        return JSON.parse(result.stdout)
    }

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    if (/E404|is not in this registry|No match found/i.test(output)) {
        return undefined
    }

    process.stderr.write(output)
    process.exit(result.status ?? 1)
}

function registryTags(packageName) {
    const result = run('npm', ['view', packageName, 'dist-tags', '--json'], {
        capture: true
    })
    return JSON.parse(result.stdout)
}

const packages = packageRoots.map(packageRoot => ({
    root: packageRoot,
    manifest: readManifest(packageRoot)
}))
const versions = new Set(packages.map(entry => entry.manifest.version))

if (versions.size !== 1) {
    throw new Error(`Package versions are not aligned: ${[...versions].join(', ')}`)
}

const [version] = versions
if (!/^\d+\.\d+\.\d+-rc\.\d+$/.test(version)) {
    throw new Error(`Refusing to publish non-RC version ${version} with the ${tag} tag.`)
}

if (!dryRun) {
    for (const entry of packages) {
        assertClean(entry.root, entry.manifest.name)
    }
}

console.log(`\nRelease candidate: ${version}`)
console.log(`Registry tag:      ${tag}`)
console.log(`Mode:              ${dryRun ? 'dry run' : 'publish'}\n`)

run('npm', ['run', 'release:check'])

if (dryRun) {
    for (const entry of packages) {
        console.log(`\nDry-running ${entry.manifest.name}@${version}`)
        run('npm', ['publish', '--tag', tag, '--dry-run'], { cwd: entry.root })
    }
    console.log(`\nDry run completed for all ${packages.length} packages.`)
    process.exit(0)
}

for (const entry of packages) {
    assertClean(entry.root, entry.manifest.name)
}

console.log('\nChecking npm authentication...')
run('npm', ['whoami'])

for (const entry of packages) {
    const { name } = entry.manifest
    const packageSpec = `${name}@${version}`
    const publishedVersion = registryVersion(packageSpec)

    if (publishedVersion === version) {
        const tags = registryTags(name)
        if (tags[tag] !== version) {
            console.log(`\nRepairing ${tag} tag for ${packageSpec}`)
            run('npm', ['dist-tag', 'add', packageSpec, tag])
        } else {
            console.log(`\nSkipping ${packageSpec}; it is already published and tagged ${tag}.`)
        }
        continue
    }

    console.log(`\nPublishing ${packageSpec} with tag ${tag}`)
    run('npm', ['publish', '--tag', tag], { cwd: entry.root })
}

console.log(`\nPublished all ${packages.length} packages at ${version} with tag ${tag}.`)
