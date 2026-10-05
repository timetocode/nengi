import { User } from '../../server/User'
import { EMPTY_SNAPSHOT_ARRAY } from './SnapshotPlan'

const MAX_RESPONSES_PER_FRAME = 255

export function collectSkipInterpolationNids(user: User) {
    let nids: number[] | undefined

    for (const channel of user.subscriptions.values()) {
        const skipInterpolationNids = (channel as any).skipInterpolationNids as number[] | undefined
        if (!skipInterpolationNids || skipInterpolationNids.length === 0) {
            continue
        }
        nids ??= []
        for (let i = 0; i < skipInterpolationNids.length; i++) {
            nids.push(skipInterpolationNids[i])
        }
    }

    return nids ?? EMPTY_SNAPSHOT_ARRAY
}

export { MAX_RESPONSES_PER_FRAME }
