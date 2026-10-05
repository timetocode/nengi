import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPublicDocs } from './check-public-docs.mjs'
import { starterFiles } from './published-content.mjs'

function fixture(readme = '') {
    const files = new Set(['README.md', 'CHANGELOG.md', 'docs/ai/README.md', 'docs/ai/getting-started.md', ...starterFiles])
    const markdown = new Map([
        ['README.md', readme],
        ['docs/ai/getting-started.md', '# Getting started\n## Connection lifecycle\n## Connection lifecycle']
    ])
    return { files, markdown }
}

test('owned examples and duplicate heading anchors are valid public guidance', () => {
    const { files, markdown } = fixture('[Example](./examples/basic-movement/README.md)\n[Second heading](./docs/ai/getting-started.md#connection-lifecycle-1)')
    assert.deepEqual(checkPublicDocs(files, markdown), [])
})

test('source-only links and missing anchors fail even when a checkout could resolve them', () => {
    const { files, markdown } = fixture('[Source](./src/index.ts)\n[Wrong heading](./docs/ai/getting-started.md#absent)')
    assert.deepEqual(checkPublicDocs(files, markdown), [
        'README.md links outside the shipped package: ./src/index.ts',
        'README.md links to a missing heading: ./docs/ai/getting-started.md#absent'
    ])
})

test('a missing starter file or accidentally packed experiment is rejected', () => {
    const { files, markdown } = fixture()
    files.delete('examples/basic-movement/game.ts')
    files.add('examples/unmaintained/server.ts')
    files.add('scripts/compatibility-baseline/nengi.tgz')
    assert.equal(checkPublicDocs(files, markdown).length, 3)
})

test('private paths fail and code-fenced headings do not satisfy public links', () => {
    const { files, markdown } = fixture('[Missing](#inside-code)\n```md\n# Inside code\n```\n/home/someone/private-game')
    assert.deepEqual(checkPublicDocs(files, markdown), [
        'README.md contains a private workspace path',
        'README.md links to a missing heading: #inside-code'
    ])
})
