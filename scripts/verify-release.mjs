import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoots = [
    coreRoot,
    path.resolve(coreRoot, '../nengi-buffers'),
    path.resolve(coreRoot, '../nengi-dataviews'),
    path.resolve(coreRoot, '../nengi-websocket-client-adapter'),
    path.resolve(coreRoot, '../nengi-ws-client-adapter'),
    path.resolve(coreRoot, '../nengi-ws-instance-adapter'),
    path.resolve(coreRoot, '../nengi-uws-instance-adapter'),
    path.resolve(coreRoot, '../nengi-bun-instance-adapter'),
    path.resolve(coreRoot, '../nengi-deno-instance-adapter')
]
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

for (const packageRoot of packageRoots) {
    const packageJson = readJson(path.join(packageRoot, 'package.json'))
    const packageLock = readJson(path.join(packageRoot, 'package-lock.json'))
    const name = packageJson.name
    const lockRoot = packageLock.packages?.['']

    if (packageJson.version !== corePackage.version) {
        errors.push(`${name} version ${packageJson.version} does not match nengi ${corePackage.version}`)
    }
    if (packageLock.version !== packageJson.version || lockRoot?.version !== packageJson.version) {
        errors.push(`${name} package-lock version does not match ${packageJson.version}`)
    }

    for (const dependencyGroup of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const dependencies = packageJson[dependencyGroup] || {}
        for (const [dependency, version] of Object.entries(dependencies)) {
            if (dependency.startsWith('nengi') && version !== corePackage.version) {
                errors.push(`${name} ${dependencyGroup}.${dependency} must equal ${corePackage.version}`)
            }
            if (dependency.startsWith('nengi') && lockRoot?.[dependencyGroup]?.[dependency] !== version) {
                errors.push(`${name} package-lock root ${dependencyGroup}.${dependency} does not match its manifest`)
            }
        }
    }

    // Root declarations alone can hide an older package in the resolved tree.
    for (const [location, entry] of Object.entries(packageLock.packages || {})) {
        const dependency = location.split('/').at(-1)
        if (!location || !dependency.startsWith('nengi')) continue
        if (entry.version !== corePackage.version) {
            errors.push(`${name} locks ${dependency}@${entry.version}, expected ${corePackage.version}`)
        }
        const expectedUrl = `https://registry.npmjs.org/${dependency}/-/${dependency}-${corePackage.version}.tgz`
        if (entry.resolved !== expectedUrl || !entry.integrity?.startsWith('sha512-')) {
            errors.push(`${name} ${location} needs the release registry URL and artifact integrity`)
        }
        for (const group of ['dependencies', 'peerDependencies']) {
            for (const [child, version] of Object.entries(entry[group] || {})) {
                if (child.startsWith('nengi') && version !== corePackage.version) {
                    errors.push(`${name} ${location}.${group}.${child} must equal ${corePackage.version}`)
                }
            }
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

console.log(`Release inputs verified for nengi ${corePackage.version}: ${packageRoots.length} aligned packages.`)
