import fs from 'node:fs'
import path from 'node:path'
import { prepareFamily, buildFamily, installCandidate, verifyCandidate, finishFamily, run } from './package-family.mjs'
import { testCompatibility } from './test-adapter-compatibility.mjs'
import { testStarter } from './test-starter.mjs'

const family = prepareFamily()
let success = false
try {
    buildFamily(family)
    const { consumer, artifacts } = installCandidate(family)
    verifyCandidate(family, consumer)
    for (const pkg of family.packages) {
        console.log(`\nTesting ${pkg.name} against the installed candidate`)
        run('npm', ['test', '--', '--runInBand'], pkg.root)
    }
    const consumerTests = ['test-family-connections.cjs', 'test-family-binary.cjs'].map(name => {
        const target = path.join(consumer, name)
        fs.copyFileSync(new URL(name, import.meta.url), target)
        return target
    })
    run(process.execPath, ['--test', ...consumerTests], consumer)
    const apiConsumer = path.join(consumer, 'test-family-api.ts')
    fs.copyFileSync(new URL('test-family-api.ts', import.meta.url), apiConsumer)
    const tsc = path.join(family.packages[0].source, 'node_modules', 'typescript', 'bin', 'tsc')
    run(process.execPath, [tsc, '--strict', '--target', 'es2020', '--module', 'node16',
        '--moduleResolution', 'node16', '--outDir', 'compiled', apiConsumer], consumer)
    run(process.execPath, [path.join(consumer, 'compiled', 'test-family-api.js')], consumer)
    const starter = testStarter(family, consumer, artifacts)
    const verification = verifyCandidate(family, consumer)
    const compatibility = testCompatibility(family, artifacts)
    fs.writeFileSync(path.join(family.temporaryRoot, 'verification.json'), JSON.stringify({ artifacts, ...verification, compatibility, starter, testsPassed: true }, null, 2) + '\n')
    success = true
    console.log('All nine package suites and candidate connection/binary checks passed; installed contents and dependency resolutions verified.')
} finally {
    finishFamily(family, success)
}
