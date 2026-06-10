"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryDebugError = void 0;
exports.createBinaryDebugError = createBinaryDebugError;
class BinaryDebugError extends Error {
    constructor(message, originalError, context) {
        super(message);
        this.name = 'BinaryDebugError';
        this.originalError = originalError;
        this.context = context;
    }
}
exports.BinaryDebugError = BinaryDebugError;
function createBinaryDebugError(originalError, context) {
    const detail = Object.entries(context)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${formatValue(value)}`)
        .join('\n');
    const originalMessage = originalError instanceof Error ? originalError.message : String(originalError);
    return new BinaryDebugError(`nengi binary ${context.phase || 'operation'} failed\n${detail}\nOriginal error: ${originalMessage}`, originalError, Object.assign({}, context));
}
function formatValue(value) {
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return String(value);
    }
    try {
        const json = JSON.stringify(value);
        return json === undefined ? String(value) : json;
    }
    catch (_a) {
        return Object.prototype.toString.call(value);
    }
}
