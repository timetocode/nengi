/** Channel-owned membership snapshots. Borrow these collections without mutating them. */
export type ChannelVisibilitySnapshot = {
    readonly toCreate: readonly number[]
    readonly toUpdate: readonly number[]
    readonly toDelete: readonly number[]
    readonly visibleRef: readonly number[]
    readonly visibleSet: ReadonlySet<number>
    readonly previousVisibleSet?: ReadonlySet<number>
}

export type RememberedVisibility = {
    visibleRef: readonly number[]
    visibleSet?: ReadonlySet<number>
}

const EMPTY_NIDS: readonly number[] = []

type VisibilityRevision = {
    initial: ChannelVisibilitySnapshot
    stable: ChannelVisibilitySnapshot
    transitions: WeakMap<readonly number[], ChannelVisibilitySnapshot>
}

/** Share membership work, while each subscriber still commits its own previous view. */
export class ChannelVisibilityCache {
    private current: VisibilityRevision | undefined

    collect(visibleRef: readonly number[], previous?: RememberedVisibility): ChannelVisibilitySnapshot {
        let current = this.current
        if (!current || current.stable.visibleRef !== visibleRef) {
            const visibleSet = new Set(visibleRef)
            current = {
                initial: { toCreate: visibleRef, toUpdate: EMPTY_NIDS, toDelete: EMPTY_NIDS, visibleRef, visibleSet },
                stable: { toCreate: EMPTY_NIDS, toUpdate: visibleRef, toDelete: EMPTY_NIDS, visibleRef, visibleSet, previousVisibleSet: visibleSet },
                transitions: new WeakMap()
            }
            this.current = current
        }

        if (!previous) return current.initial
        if (previous.visibleRef === visibleRef) return current.stable

        const cached = current.transitions.get(previous.visibleRef)
        if (cached) return cached

        const visibleSet = current.stable.visibleSet
        const previousVisibleSet = previous.visibleSet ?? new Set(previous.visibleRef)
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []
        for (let i = 0; i < visibleRef.length; i++) {
            const nid = visibleRef[i]
            if (previousVisibleSet.has(nid)) {
                toUpdate.push(nid)
            } else {
                toCreate.push(nid)
            }
        }
        previousVisibleSet.forEach(nid => {
            if (!visibleSet.has(nid)) toDelete.push(nid)
        })

        const visibility = { toCreate, toUpdate, toDelete, visibleRef, visibleSet, previousVisibleSet }
        // Weak keys do not retain a subscriber's obsolete membership arrays.
        // Replacing the current revision also discards all its comparisons.
        current.transitions.set(previous.visibleRef, visibility)
        return visibility
    }

    clear() {
        this.current = undefined
    }
}
