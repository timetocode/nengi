import path from 'node:path'
import { isPublicCoreFile, starterFiles } from './published-content.mjs'

function prose(markdown) {
    let fence
    return markdown.split('\n').filter(line => {
        const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
        if (match) {
            if (!fence) fence = match[1]
            else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = undefined
            return false
        }
        return !fence
    }).join('\n')
}

function headingIds(markdown) {
    const ids = new Set()
    for (const match of prose(markdown).matchAll(/^#{1,6}\s+(.+)$/gm)) {
        const base = match[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-')
        let id = base
        let suffix = 0
        while (ids.has(id)) id = `${base}-${++suffix}`
        ids.add(id)
    }
    return ids
}

// Check the actual npm file list, not what happens to exist in a source checkout.
// The maintained Markdown uses inline links and ATX headings.
export function checkPublicDocs(files, markdown) {
    const errors = []
    for (const file of files) {
        if (!isPublicCoreFile(file)) errors.push(`Unexpected public package file: ${file}`)
    }
    for (const file of ['README.md', 'CHANGELOG.md', 'docs/ai/README.md', 'docs/ai/getting-started.md', ...starterFiles]) {
        if (!files.has(file)) errors.push(`Missing public package file: ${file}`)
    }
    const headings = new Map([...markdown].map(([file, content]) => [file, headingIds(content)]))
    for (const [file, content] of markdown) {
        if (/\/(?:home|Users|mnt\/c\/Users)\//.test(content) || content.includes('nengi-rc-notes/')) {
            errors.push(`${file} contains a private workspace path`)
        }
        for (const match of prose(content).matchAll(/\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g)) {
            const link = match[1] ?? match[2]
            if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)) continue
            const [href, hash] = link.split('#')
            let target
            let anchor
            try {
                target = href ? path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(href))) : file
                anchor = hash ? decodeURIComponent(hash) : undefined
            } catch {
                errors.push(`${file} has an invalid link: ${link}`)
                continue
            }
            if (href.startsWith('/') || !files.has(target)) {
                errors.push(`${file} links outside the shipped package: ${link}`)
            } else if (anchor && headings.has(target) && !headings.get(target).has(anchor)) {
                errors.push(`${file} links to a missing heading: ${link}`)
            }
        }
    }
    return errors
}
