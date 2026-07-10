export type TimeSource = () => number

/**
 * Returns elapsed time from a monotonic clock when the host provides one.
 * Date.now() is only a compatibility fallback for unusual runtimes.
 */
export function getMonotonicTime() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now()
    }
    return Date.now()
}
