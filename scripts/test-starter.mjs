import fs from 'node:fs'
import path from 'node:path'
import { run, verifyArtifacts } from './package-family.mjs'
import { starterDirectory } from './published-content.mjs'

export function testStarter(family, consumer, artifacts) {
    const project = path.join(family.temporaryRoot, 'starter')
    fs.cpSync(path.join(consumer, 'node_modules', 'nengi', starterDirectory), project, { recursive: true })
    const packageNames = ['nengi', 'nengi-buffers', 'nengi-dataviews', 'nengi-ws-instance-adapter', 'nengi-websocket-client-adapter']
    const installed = artifacts.filter(artifact => packageNames.includes(artifact.name))
    // Install the copied project's tools and the exact candidate artifacts together.
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
        ...installed.map(artifact => artifact.file)], project)
    verifyArtifacts(installed, project)
    run('npm', ['run', 'build'], project)
    const test = path.join(project, 'starter-network.test.ts')
    fs.copyFileSync(new URL('test-starter-network.ts', import.meta.url), test)
    run(process.execPath, ['--import', 'tsx', '--test', test], project)
    verifyArtifacts(installed, project)
    return { project, buildPassed: true, networkPassed: true }
}
