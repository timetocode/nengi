import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { packageNames, validateFamily, validateLockfile } from './package-policy.mjs'

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoots = packageNames.map(name => path.resolve(coreRoot, '..', name))
const errors = []

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function walk(directory) {
    if (!fs.existsSync(directory)) {
        return []
    }
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name)
        return entry.isDirectory() ? walk(target) : [target]
    })
}

function findFileSpecs(value, location, output) {
    if (typeof value === 'string') {
        if (value.startsWith('file:')) {
            output.push(location)
        }
        return
    }
    if (!value || typeof value !== 'object') {
        return
    }
    for (const [key, child] of Object.entries(value)) {
        findFileSpecs(child, `${location}.${key}`, output)
    }
}

const corePackage = readJson(path.join(coreRoot, 'package.json'))
errors.push(...validateFamily(packageRoots.map(root => readJson(path.join(root, 'package.json')))))
const artifacts = new Map(packageRoots.map(root => {
    const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
        cwd: root, encoding: 'utf8', shell: process.platform === 'win32'
    }))
    if (packed.files.some(file => file.path.startsWith('scripts/'))) {
        errors.push(`${packed.name} unexpectedly ships source-only tooling or compatibility fixtures`)
    }
    return [packed.name, packed]
}))

for (const packageRoot of packageRoots) {
    const packageJson = readJson(path.join(packageRoot, 'package.json'))
    const packageLock = readJson(path.join(packageRoot, 'package-lock.json'))
    const name = packageJson.name
    errors.push(...validateLockfile(packageJson, packageLock))
    for (const [location, entry] of Object.entries(packageLock.packages ?? {})) {
        const artifact = artifacts.get(location.split('/').at(-1))
        if (artifact && entry.version === artifact.version && entry.integrity !== artifact.integrity) {
            errors.push(`${name} ${location} integrity differs from the staged artifact; run npm run release:locks after changing shipped files`)
        }
    }

    const fileSpecs = []
    findFileSpecs(packageJson, `${name}.package.json`, fileSpecs)
    findFileSpecs(packageLock, `${name}.package-lock.json`, fileSpecs)
    for (const location of fileSpecs) {
        errors.push(`${location} contains a file: dependency`)
    }

    for (const entry of [packageJson.main, packageJson.types]) {
        if (!entry || !fs.existsSync(path.resolve(packageRoot, entry))) {
            errors.push(`${name} package entry is missing: ${entry}`)
        }
    }
    if (!packageJson.scripts?.build?.includes('npm run clean')) {
        errors.push(`${name} build does not begin from a clean build directory`)
    }
    if (!packageJson.scripts?.prepack) {
        errors.push(`${name} does not define a prepack build`)
    }
    const readme = fs.readFileSync(path.join(packageRoot, 'README.md'), 'utf8')
    if (!readme.includes(packageJson.version)) {
        errors.push(`${name} README does not mention its exact package version ${packageJson.version}`)
    }

    const sourceRoot = path.join(packageRoot, 'src')
    const buildRoot = path.join(packageRoot, 'build')
    for (const output of walk(buildRoot)) {
        let sourceRelative = null
        if (output.endsWith('.d.ts')) {
            sourceRelative = path.relative(buildRoot, output).slice(0, -5) + '.ts'
        } else if (output.endsWith('.js')) {
            sourceRelative = path.relative(buildRoot, output).slice(0, -3) + '.ts'
        }
        if (sourceRelative && !fs.existsSync(path.join(sourceRoot, sourceRelative))) {
            errors.push(`${name} build contains orphaned output ${path.relative(packageRoot, output)}`)
        }
    }
}

if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
}

console.log(`Release inputs verified for nengi ${corePackage.version}: ${packageRoots.length} independently versioned packages.`)
