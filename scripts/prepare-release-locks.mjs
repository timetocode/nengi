import fs from 'node:fs'
import path from 'node:path'
import { prepareFamily, buildFamily, packPackages, finishFamily } from './package-family.mjs'
import { isFamily, registryTarball, validateLockfile } from './package-policy.mjs'

// Only refresh nengi-family entries. External dependency changes still belong
// to npm install. Staged URLs will become downloadable when these exact
// artifacts are published; their integrity is measured now, not guessed.
const family = prepareFamily()
let success = false
try {
    buildFamily(family)
    const artifacts = packPackages(family.packages, path.join(family.temporaryRoot, 'tarballs'))
    const byName = new Map(artifacts.map(artifact => [artifact.name, artifact]))
    const updates = []
    for (const pkg of family.packages) {
        const file = path.join(pkg.source, 'package-lock.json')
        const lock = JSON.parse(fs.readFileSync(file, 'utf8'))
        lock.version = pkg.manifest.version
        lock.packages[''].version = pkg.manifest.version
        for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
            if (pkg.manifest[group]) lock.packages[''][group] = pkg.manifest[group]
            else delete lock.packages[''][group]
        }
        for (const [location, entry] of Object.entries(lock.packages)) {
            const name = location.split('/').at(-1)
            if (!location || !isFamily(name)) continue
            const artifact = byName.get(name)
            // An adapter's development pin can intentionally remain on an older
            // compatible core. Leave that published artifact's metadata intact.
            const directPin = pkg.manifest.devDependencies?.[name]
            if (location === `node_modules/${name}` && directPin === entry.version && directPin !== artifact.version) continue
            Object.assign(entry, { version: artifact.version,
                resolved: registryTarball(name, artifact.version), integrity: artifact.integrity })
            delete entry.link
            for (const key of ['dependencies', 'peerDependencies', 'peerDependenciesMeta', 'optionalDependencies', 'engines']) {
                if (artifact.manifest[key]) entry[key] = artifact.manifest[key]
                else delete entry[key]
            }
        }
        const errors = validateLockfile(pkg.manifest, lock)
        if (errors.length) throw new Error(`${errors.join('\n')}\nInstall changed external dependencies before preparing release locks.`)
        updates.push({ file, lock })
    }
    for (const { file, lock } of updates) fs.writeFileSync(file, JSON.stringify(lock, null, 2) + '\n')
    fs.writeFileSync(path.join(family.temporaryRoot, 'artifacts.json'), JSON.stringify(artifacts, null, 2) + '\n')
    success = true
    console.log('Family lock entries refreshed from measured tarball contents. Unpublished registry URLs become usable after publication.')
} finally {
    finishFamily(family, success)
}
