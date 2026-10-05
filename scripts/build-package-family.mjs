import fs from 'node:fs'
import path from 'node:path'
import { prepareFamily, buildFamily, finishFamily } from './package-family.mjs'

const family = prepareFamily()
let success = false
try {
    buildFamily(family)
    for (const pkg of family.packages) {
        const output = path.join(pkg.source, 'build')
        fs.rmSync(output, { recursive: true, force: true })
        fs.cpSync(path.join(pkg.root, 'build'), output, { recursive: true })
    }
    success = true
    console.log('Built all nine packages against the current candidate family.')
} finally {
    finishFamily(family, success)
}
