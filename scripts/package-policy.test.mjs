import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPublishedArtifact, packageNames, parsePublishArgs, registryTarball, satisfies, validateFamily, validateLockfile } from './package-policy.mjs'

const range = '>=2.0.0-rc.128 <2.0.0'
const manifests = packageNames.map(name => ({ name, version: '2.0.0-rc.128',
    ...(name === 'nengi' ? {} : { peerDependencies: { nengi: range } }) }))

test('RC ranges accept later compatible RCs without opting into older or different trains', () => {
    for (const version of ['2.0.0-rc.128', '2.0.0-rc.129', '2.0.0-rc.500']) assert.equal(satisfies(version, range), true)
    for (const version of ['2.0.0-rc.127', '2.0.0', '2.1.0-rc.1', '3.0.0-rc.1']) assert.equal(satisfies(version, range), false)
    assert.equal(satisfies('2.0.0-rc.129', '^2.0.0'), false)
    assert.equal(satisfies('2.3.4', '^2.0.0'), true)
    assert.equal(satisfies('3.0.0', '^2.0.0'), false)
})

test('a core-only release accepts unchanged adapter versions and older development pins', () => {
    const family = structuredClone(manifests)
    family[0].version = '2.0.0-rc.129'
    family[1].devDependencies = { nengi: '2.0.0-rc.128' }
    assert.deepEqual(validateFamily(family), [])
    family[0].version = '2.0.0-rc.127'
    assert.ok(validateFamily(family).some(error => error.includes('requires nengi')))
})

test('a binary backend is versioned and checked independently of its transport', () => {
    const family = structuredClone(manifests)
    family[1].version = '2.0.0-rc.130'
    family[3].dependencies = { 'nengi-buffers': range }
    assert.deepEqual(validateFamily(family), [])
    family[3].dependencies['nengi-buffers'] = '2.0.0-rc.128'
    assert.ok(validateFamily(family).some(error => error.includes('requires nengi-buffers')))
})

test('locks validate their own resolved versions and the nearest nested dependency', () => {
    const manifest = { name: 'nengi-ws-instance-adapter', version: '2.0.0-rc.128',
        dependencies: { 'nengi-buffers': range }, peerDependencies: { nengi: range } }
    const entry = (name, version) => ({ version, resolved: registryTarball(name, version), integrity: 'sha512-dGVzdA==' })
    const lock = { version: manifest.version, packages: {
        '': manifest,
        'node_modules/nengi': entry('nengi', '2.0.0-rc.129'),
        'node_modules/nengi-buffers': { ...entry('nengi-buffers', '2.0.0-rc.128'), peerDependencies: { nengi: range } }
    } }
    assert.deepEqual(validateLockfile(manifest, lock), [])
    lock.packages['node_modules/nengi-buffers/node_modules/nengi'] = entry('nengi', '2.0.0-rc.127')
    assert.ok(validateLockfile(manifest, lock).some(error => error.includes('node_modules/nengi-buffers requires nengi')))
    delete lock.packages['node_modules/nengi-buffers/node_modules/nengi']
    lock.packages['node_modules/nengi'].resolved = 'file:../nengi'
    assert.ok(validateLockfile(manifest, lock).some(error => error.includes('registry version')))
})

test('publishing selects only explicit packages in dependency order', () => {
    const plan = parsePublishArgs(['--packages', 'nengi-ws-instance-adapter,nengi', '--tag', 'rc', '--dry-run'], manifests)
    assert.deepEqual(plan.entries.map(entry => entry.name), ['nengi', 'nengi-ws-instance-adapter'])
    assert.equal(plan.dryRun, true)
    assert.equal(parsePublishArgs(['--packages', 'nengi', '--tag', 'rc'], manifests).entries.length, 1)
    for (const args of [[], ['--dry-run'], ['--all'], ['--packages', 'typo', '--tag', 'rc'],
        ['--packages', 'nengi,nengi', '--tag', 'rc'], ['--all', '--tag', 'latest'], ['--all', '--packages', 'nengi', '--tag', 'rc']]) {
        assert.throws(() => parsePublishArgs(args, manifests))
    }
    const stable = manifests.map(manifest => ({ ...manifest, version: '2.0.0' }))
    assert.equal(parsePublishArgs(['--all', '--tag', 'latest'], stable).entries.length, 9)
    assert.throws(() => parsePublishArgs(['--all', '--tag', 'rc'], stable))
})

test('published artifacts cannot be silently replaced, omitted or retagged backward', () => {
    const artifact = { manifest: manifests[0], integrity: 'sha512-current' }
    const published = { dist: { integrity: artifact.integrity } }
    assert.equal(checkPublishedArtifact(artifact, published, false, 'rc', '2.0.0-rc.129'), false)
    assert.equal(checkPublishedArtifact(artifact, published, true, 'rc', '2.0.0-rc.128'), false)
    assert.equal(checkPublishedArtifact(artifact, published, true, 'rc', '2.0.0-rc.127'), true)
    assert.equal(checkPublishedArtifact(artifact, undefined, true, 'rc'), true)
    assert.throws(() => checkPublishedArtifact(artifact, undefined, false, 'rc'), /unpublished/)
    assert.throws(() => checkPublishedArtifact(artifact, { dist: { integrity: 'different' } }, true, 'rc'), /different contents/)
    assert.throws(() => checkPublishedArtifact(artifact, published, true, 'rc', '2.0.0-rc.129'), /backward/)
})
