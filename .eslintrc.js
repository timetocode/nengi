// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')

module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    env: {
        node: true,
    },
    parserOptions: {
        tsconfigRootDir: path.resolve(process.cwd()),
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    rules: {
        semi: ['error', 'never'], // No semicolons
        quotes: ['error', 'single'], // Single quotes for imports
        indent: ['error', 4],
        'no-extra-semi': 'error', // No unnecessary semicolons
        'no-multi-spaces': 'error', // No multiple spaces
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
    },
}