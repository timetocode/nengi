// The package owns this complete starter. Other repository experiments are not public guidance.
export const starterDirectory = 'examples/basic-movement'
export const starterFiles = [
    'README.md', 'package.json', 'tsconfig.json', 'protocol.ts', 'game.ts',
    'server.ts', 'client-state.ts', 'client.ts', 'dev.ts', 'index.html', 'style.css'
].map(file => `${starterDirectory}/${file}`)

export function isPublicCoreFile(file) {
    return ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'LICENSE.txt'].includes(file)
        || (/^build\/.+\.(js|d\.ts)(\.map)?$/.test(file)
            && !/^build\/(performance|testSupport)\//.test(file)
            && !/\.(test|spec)\./.test(file))
        || /^docs\/ai\/[^/]+\.md$/.test(file)
        || starterFiles.includes(file)
}
