import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const requests = JSON.parse(fs.readFileSync(0, 'utf8'))
const resolutions = requests.map(({ origin, dependency }) => {
    const require = createRequire(path.join(origin, 'package.json'))
    return { origin, dependency, resolved: fs.realpathSync(require.resolve(dependency)) }
})
process.stdout.write(JSON.stringify(resolutions))
