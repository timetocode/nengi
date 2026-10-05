import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { packageNames as names, validateFamily } from './package-policy.mjs'
import { starterFiles } from './published-content.mjs'

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function run(command, args, cwd, capture = false) {
    const result = spawnSync(command, args, {
        cwd,
        encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit',
        shell: process.platform === 'win32',
        env: process.platform === 'win32' ? process.env : { ...process.env, TMPDIR: '/tmp' }
    })
    if (result.status !== 0) {
        if (capture) {
            process.stdout.write(result.stdout ?? '')
            process.stderr.write(result.stderr ?? '')
        }
        throw new Error(`${command} ${args.join(' ')} failed in ${cwd}: ${result.error?.message ?? result.status}`)
    }
    return result.stdout
}

function linkDirectory(target, link) {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
}

export function prepareFamily() {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nengi-family-'))
    console.log(`Candidate workspace: ${temporaryRoot}`)
    const packages = names.map(name => ({
        name,
        source: path.resolve(coreRoot, '..', name),
        root: path.join(temporaryRoot, 'packages', name)
    }))
    const sourceDirectories = new Set(['src', 'test', 'tests', 'docs', 'scripts'])
    for (const pkg of packages) {
        fs.mkdirSync(pkg.root, { recursive: true })
        for (const entry of fs.readdirSync(pkg.source, { withFileTypes: true })) {
            const isConfig = /^(package(?:-lock)?\.json|tsconfig.*\.json|jest\.config\..*|\.eslint.*|README.*|CHANGELOG\.md|LICENSE.*)$/i.test(entry.name)
            if (sourceDirectories.has(entry.name) || (entry.isFile() && isConfig)) {
                fs.cpSync(path.join(pkg.source, entry.name), path.join(pkg.root, entry.name), { recursive: true })
            }
        }
        if (pkg.name === 'nengi') {
            for (const file of starterFiles) {
                fs.mkdirSync(path.dirname(path.join(pkg.root, file)), { recursive: true })
                fs.copyFileSync(path.join(pkg.source, file), path.join(pkg.root, file))
            }
        }
        pkg.manifest = JSON.parse(fs.readFileSync(path.join(pkg.root, 'package.json'), 'utf8'))
        fs.mkdirSync(path.join(pkg.root, 'node_modules'))
        // Reuse installed build/test tools, but never the installed nengi family.
        for (const entry of fs.readdirSync(path.join(pkg.source, 'node_modules'), { withFileTypes: true })) {
            if (names.includes(entry.name) || entry.name === '.package-lock.json') continue
            const target = path.join(pkg.source, 'node_modules', entry.name)
            if (fs.statSync(target).isDirectory()) linkDirectory(target, path.join(pkg.root, 'node_modules', entry.name))
        }
    }
    const errors = validateFamily(packages.map(pkg => pkg.manifest))
    if (errors.length) throw new Error(errors.join('\n'))
    for (const pkg of packages) {
        for (const dependency of packages) {
            if (dependency !== pkg) linkDirectory(dependency.root, path.join(pkg.root, 'node_modules', dependency.name))
        }
    }
    return { temporaryRoot, packages }
}

export function buildFamily(family) {
    for (const pkg of family.packages) {
        console.log(`\nBuilding candidate ${pkg.name}`)
        run('npm', ['run', 'build'], pkg.root)
    }
}

export function packPackages(packages, tarballs) {
    fs.mkdirSync(tarballs, { recursive: true })
    const artifacts = []
    for (const pkg of packages) {
        // buildFamily already built every package against the same candidate.
        const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', tarballs], pkg.root, true))[0]
        artifacts.push({ name: pkg.name, version: pkg.manifest.version, manifest: pkg.manifest,
            integrity: packed.integrity, file: path.join(tarballs, packed.filename), files: contentHashes(pkg.root) })
    }
    return artifacts
}

export function installArtifacts(artifacts, consumer) {
    const errors = validateFamily(artifacts.map(artifact => artifact.manifest))
    if (errors.length) throw new Error(errors.join('\n'))
    for (const artifact of artifacts) {
        const integrity = `sha512-${createHash('sha512').update(fs.readFileSync(artifact.file)).digest('base64')}`
        if (integrity !== artifact.integrity) throw new Error(`Artifact integrity mismatch: ${artifact.file}`)
    }
    fs.mkdirSync(consumer, { recursive: true })
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'nengi-family-verification', private: true }))
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', ...artifacts.map(item => item.file)], consumer)
    verifyArtifacts(artifacts, consumer)
}

export function verifyArtifacts(artifacts, consumer) {
    const requests = []
    const expected = new Map()
    for (const artifact of artifacts) {
        const installed = path.join(consumer, 'node_modules', artifact.name)
        if (JSON.stringify(contentHashes(installed)) !== JSON.stringify(artifact.files)) {
            throw new Error(`Installed artifact differs from frozen contents: ${artifact.name}`)
        }
        expected.set(artifact.name, fs.realpathSync(path.resolve(installed, artifact.manifest.main)))
        requests.push({ origin: consumer, dependency: artifact.name })
        for (const dependency of Object.keys({ ...artifact.manifest.dependencies, ...artifact.manifest.peerDependencies }).filter(name => names.includes(name))) {
            requests.push({ origin: installed, dependency })
        }
    }
    const probe = spawnSync(process.execPath, [fileURLToPath(new URL('./resolve-package-family.mjs', import.meta.url))], {
        encoding: 'utf8', input: JSON.stringify(requests)
    })
    if (probe.status !== 0) throw new Error(`Artifact resolution failed: ${probe.stderr}`)
    for (const { origin, dependency, resolved } of JSON.parse(probe.stdout)) {
        if (resolved !== expected.get(dependency)) throw new Error(`${origin} resolves an unexpected ${dependency}: ${resolved}`)
    }
}

export function installCandidate(family) {
    const artifacts = packPackages(family.packages, path.join(family.temporaryRoot, 'tarballs'))
    const consumer = path.join(family.temporaryRoot, 'consumer')
    installArtifacts(artifacts, consumer)
    for (const pkg of family.packages) {
        for (const dependency of family.packages) {
            if (dependency === pkg) continue
            const link = path.join(pkg.root, 'node_modules', dependency.name)
            // unlink removes only this temporary link, never its target.
            fs.unlinkSync(link)
            linkDirectory(path.join(consumer, 'node_modules', dependency.name), link)
        }
    }
    return { consumer, artifacts }
}

function hashes(directory, prefix = '') {
    const result = {}
    if (!fs.existsSync(directory)) return result
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name)
        const key = `${prefix}${entry.name}`
        if (entry.isDirectory()) Object.assign(result, hashes(file, `${key}/`))
        else result[key] = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    }
    return result
}

export function contentHashes(root) {
    const files = { ...hashes(path.join(root, 'build'), 'build/'), ...hashes(path.join(root, 'docs'), 'docs/') }
    for (const name of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', ...starterFiles]) {
        if (fs.existsSync(path.join(root, name))) files[name] = createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')
    }
    return files
}

export function verifyCandidate(family, consumer) {
    const result = { packages: [], resolutions: [] }
    const expectedEntries = new Map()
    const requests = []
    for (const pkg of family.packages) {
        const installed = path.join(consumer, 'node_modules', pkg.name)
        const actualManifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'))
        for (const key of ['name', 'version', 'main', 'types', 'exports', 'dependencies', 'peerDependencies']) {
            if (JSON.stringify(pkg.manifest[key]) !== JSON.stringify(actualManifest[key])) {
                throw new Error(`Candidate manifest mismatch: ${pkg.name}.${key}`)
            }
        }
        const expected = contentHashes(pkg.root)
        const actual = contentHashes(installed)
        if (Object.keys(expected).length === 0 || JSON.stringify(expected) !== JSON.stringify(actual)) {
            throw new Error(`Installed candidate content differs from the current build: ${pkg.name}`)
        }
        expectedEntries.set(pkg.name, fs.realpathSync(path.resolve(installed, actualManifest.main)))
        requests.push({ origin: consumer, dependency: pkg.name })
        result.packages.push({ name: pkg.name, version: pkg.manifest.version, files: expected })
        for (const origin of [pkg.root, installed]) {
            const dependencies = { ...pkg.manifest.dependencies, ...pkg.manifest.peerDependencies, ...pkg.manifest.devDependencies }
            for (const dependency of Object.keys(dependencies).filter(name => names.includes(name))) {
                requests.push({ origin, dependency })
            }
        }
    }
    // A fresh process avoids Node's resolution cache hiding changed links when
    // verification runs again after the package test scripts have executed.
    const probe = spawnSync(process.execPath, [fileURLToPath(new URL('./resolve-package-family.mjs', import.meta.url))], {
        encoding: 'utf8',
        input: JSON.stringify(requests)
    })
    if (probe.status !== 0) throw new Error(`Candidate resolution failed: ${probe.error?.message ?? probe.stderr}`)
    result.resolutions = JSON.parse(probe.stdout)
    for (const { origin, dependency, resolved } of result.resolutions) {
        if (resolved !== expectedEntries.get(dependency)) {
            throw new Error(`${origin} resolves a different ${dependency}: ${resolved}`)
        }
    }
    return result
}

export function finishFamily(family, success) {
    if (success && process.env.NENGI_FAMILY_KEEP !== '1') fs.rmSync(family.temporaryRoot, { recursive: true, force: true })
    else console.log(`Candidate workspace retained: ${family.temporaryRoot}`)
}
