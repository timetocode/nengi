export type BinaryDebugFields = {
    phase?: 'count' | 'write' | 'read'
    section?: string
    index?: number
    ntype?: number
    nid?: number
    prop?: string
    propKey?: number
    binaryType?: number
    offset?: number
    value?: any
}

export class BinaryDebugError extends Error {
    originalError: any
    context: BinaryDebugFields

    constructor(message: string, originalError: any, context: BinaryDebugFields) {
        super(message)
        this.name = 'BinaryDebugError'
        this.originalError = originalError
        this.context = context
    }
}

export function createBinaryDebugError(originalError: any, context: BinaryDebugFields) {
    const detail = Object.entries(context)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${formatValue(value)}`)
        .join('\n')
    const originalMessage = originalError instanceof Error ? originalError.message : String(originalError)
    return new BinaryDebugError(
        `nengi binary ${context.phase || 'operation'} failed\n${detail}\nOriginal error: ${originalMessage}`,
        originalError,
        { ...context }
    )
}

function formatValue(value: any) {
    if (typeof value === 'string') {
        return JSON.stringify(value)
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return String(value)
    }
    try {
        const json = JSON.stringify(value)
        return json === undefined ? String(value) : json
    } catch {
        return Object.prototype.toString.call(value)
    }
}
