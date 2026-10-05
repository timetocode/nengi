import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareFamily, buildFamily, packPackages, finishFamily } from './package-family.mjs'

// Explicit, one-time bootstrap for the new contract. Tests never refresh their
// own baseline. Published releases should be retained byte-for-byte when this
// matrix is deliberately extended for a later compatibility floor.
const directory = fileURLToPath(new URL('./compatibility-baseline/', import.meta.url))
const manifest = path.join(directory, 'manifest.json')
if (fs.existsSync(manifest)) throw new Error('A frozen compatibility baseline already exists. Do not regenerate it to make a failing test pass.')
const family = prepareFamily()
let success = false
try {
    buildFamily(family)
    const artifacts = packPackages(family.packages, directory)
        .map(artifact => ({ ...artifact, file: path.basename(artifact.file) }))
    fs.writeFileSync(manifest, JSON.stringify({
        provenance: 'Unpublished rc.128 bootstrap of client contract 2 and server contract 1. These are local fixtures, not registry releases.',
        artifacts
    }, null, 2) + '\n')
    success = true
    console.log(`Frozen compatibility baseline: ${directory}`)
} finally {
    finishFamily(family, success)
}
