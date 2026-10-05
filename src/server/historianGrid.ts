// An index is optional acceleration. Bound entries as well as distinct cells:
// overlapping large samples must not multiply recording work without limit.
export const HISTORIAN_INDEX_ENTRIES_PER_SAMPLE = 16

export function historianCellSize(cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
        throw new RangeError('Historian grid cellSize must be a finite positive number.')
    }
    return Math.max(1, cellSize)
}

/** Floored bounds. Infinity selects the scan fallback when ++ cannot advance safely. */
export function historianCellSpan(min: number, max: number) {
    if (min >= -Number.MAX_SAFE_INTEGER && max <= Number.MAX_SAFE_INTEGER && min <= max) {
        return max - min + 1
    }
    return Infinity
}
