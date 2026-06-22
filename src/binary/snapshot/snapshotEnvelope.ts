import { User } from '../../server/User'

const MAX_RESPONSES_PER_FRAME = 255

export function collectSkipInterpolationNids(user: User) {
    const nids: number[] = []

    for (const channel of user.subscriptions.values()) {
        const skipInterpolationNids = (channel as any).skipInterpolationNids as number[] | undefined
        if (!skipInterpolationNids || skipInterpolationNids.length === 0) {
            continue
        }
        for (let i = 0; i < skipInterpolationNids.length; i++) {
            nids.push(skipInterpolationNids[i])
        }
    }

    return nids
}

export { MAX_RESPONSES_PER_FRAME }
