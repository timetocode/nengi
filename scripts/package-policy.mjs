import semver from 'semver'

// Dependency order, not a requirement to release every package together.
export const packageNames = [
    'nengi', 'nengi-buffers', 'nengi-dataviews',
    'nengi-ws-instance-adapter', 'nengi-uws-instance-adapter',
    'nengi-bun-instance-adapter', 'nengi-deno-instance-adapter',
    'nengi-ws-client-adapter', 'nengi-websocket-client-adapter'
]

export const registry = 'https://registry.npmjs.org/'
export const registryTarball = (name, version) => `${registry}${name}/-/${name}-${version}.tgz`
export const isFamily = name => packageNames.includes(name)

export function satisfies(version, range) {
    // Use npm's normal prerelease rules. includePrerelease would accept future
    // RC trains that the package never opted into supporting.
    return !!semver.valid(version) && !!semver.validRange(range) && semver.satisfies(version, range)
}

export function validateFamily(manifests) {
    const errors = []
    const byName = new Map(manifests.map(manifest => [manifest.name, manifest]))
    for (const manifest of manifests) {
        if (!semver.valid(manifest.version)) errors.push(`${manifest.name} has an invalid version`)
        if (manifest.name !== 'nengi' && !manifest.peerDependencies?.nengi) {
            errors.push(`${manifest.name} must declare its supported nengi peer range`)
        }
        for (const group of ['dependencies', 'peerDependencies', 'devDependencies']) {
            for (const [name, range] of Object.entries(manifest[group] ?? {})) {
                if (!isFamily(name)) continue
                if (!semver.validRange(range)) errors.push(`${manifest.name} ${group}.${name} must be a semver range`)
                // Development pins describe the checkout's reproducible tools,
                // not which other package versions consumers may install.
                if (group === 'devDependencies') continue
                const dependency = byName.get(name)
                if (!dependency || !satisfies(dependency.version, range)) {
                    errors.push(`${manifest.name} requires ${name}@${range}; candidate is ${dependency?.version ?? 'missing'}`)
                }
            }
        }
    }
    return errors
}

function resolveLocked(packages, origin, name) {
    let directory = origin
    while (true) {
        const key = directory ? `${directory}/node_modules/${name}` : `node_modules/${name}`
        if (packages[key]) return packages[key]
        if (!directory) return undefined
        const parent = directory.lastIndexOf('/node_modules/')
        directory = parent < 0 ? '' : directory.slice(0, parent)
    }
}

export function validateLockfile(manifest, lock) {
    const errors = []
    const packages = lock.packages ?? {}
    const root = packages['']
    if (lock.version !== manifest.version || root?.version !== manifest.version || root?.name !== manifest.name) {
        errors.push(`${manifest.name} package-lock identity does not match its manifest`)
    }
    for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const declared = manifest[group] ?? {}
        const locked = root?.[group] ?? {}
        const names = new Set([...Object.keys(declared), ...Object.keys(locked)])
        if ([...names].some(name => declared[name] !== locked[name])) {
            errors.push(`${manifest.name} package-lock root ${group} does not match its manifest`)
        }
    }
    for (const [location, entry] of Object.entries(packages)) {
        const name = location.split('/').at(-1)
        if (location && isFamily(name)) {
            if (!semver.valid(entry.version) || entry.link ||
                entry.resolved !== registryTarball(name, entry.version) ||
                !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity ?? '')) {
                errors.push(`${manifest.name} ${location} needs its own registry version, URL and artifact integrity`)
            }
        }
        const groups = location ? ['dependencies', 'peerDependencies'] : ['dependencies', 'devDependencies', 'peerDependencies']
        for (const group of groups) {
            for (const [dependency, range] of Object.entries(entry[group] ?? {})) {
                if (!isFamily(dependency)) continue
                const resolved = resolveLocked(packages, location, dependency)
                if (!resolved || !satisfies(resolved.version, range)) {
                    errors.push(`${manifest.name} ${location || 'root'} requires ${dependency}@${range}; lock resolves ${resolved?.version ?? 'nothing'}`)
                }
            }
        }
    }
    return errors
}

export function parsePublishArgs(args, manifests) {
    let selected
    let tag
    let dryRun = false
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--dry-run') dryRun = true
        else if (arg === '--tag' && !tag) tag = args[++i]
        else if (arg === '--packages' && !selected) selected = args[++i]?.split(',')
        else if (arg === '--all' && !selected) selected = [...packageNames]
        else throw new Error(`Unknown or repeated argument: ${arg}`)
    }
    if (!selected?.length || !['rc', 'latest'].includes(tag)) {
        throw new Error('Specify --packages name[,name] (or --all) and --tag rc|latest. Add --dry-run to inspect the release.')
    }
    if (new Set(selected).size !== selected.length || selected.some(name => !isFamily(name))) {
        throw new Error(`Unknown or duplicate package selection: ${selected.join(', ')}`)
    }
    const entries = packageNames.filter(name => selected.includes(name)).map(name => {
        const manifest = manifests.find(manifest => manifest.name === name)
        if (!manifest || !semver.valid(manifest.version)) throw new Error(`Invalid manifest for ${name}`)
        const prerelease = semver.prerelease(manifest.version)
        if (tag === 'latest' ? prerelease !== null : !/^\d+\.\d+\.\d+-rc\.\d+$/.test(manifest.version)) {
            throw new Error(`${name}@${manifest.version} cannot be published with tag ${tag}`)
        }
        return manifest
    })
    return { entries, tag, dryRun }
}

export function checkPublishedArtifact(artifact, published, selected, tag, currentTag) {
    const { name, version } = artifact.manifest
    if (published && published.dist?.integrity !== artifact.integrity) {
        throw new Error(`${name}@${version} is already published with different contents. Bump that package's version.`)
    }
    if (!selected && !published) {
        throw new Error(`${name}@${version} is unpublished. Include it in the release set or use the published compatible artifact.`)
    }
    if (selected && semver.valid(currentTag) && semver.gt(currentTag, version)) {
        throw new Error(`Refusing to move ${name}'s ${tag} tag backward from ${currentTag} to ${version}.`)
    }
    return selected && currentTag !== version
}
