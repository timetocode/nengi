#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const [url] = process.argv.slice(2)
if (!url) {
    process.exit(1)
}

const escapedUrl = url.replaceAll("'", "''")
const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Start-Process '${escapedUrl}'`],
    { stdio: 'inherit' }
)
process.exit(result.status ?? 1)
