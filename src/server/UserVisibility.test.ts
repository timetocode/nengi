import { User } from './User'

function createVisibilityChannel(nid: number, visibleNids: () => number[]) {
    return {
        nid,
        header: { nid: 100 + nid, ntype: 1 },
        getVisibleEntities: () => [],
        getVisibleNetworkedNids: visibleNids
    } as any
}

describe('User channel visibility', () => {
    it('keeps overlapping nids independent per subscribed channel', () => {
        let visibleA = [7]
        let visibleB = [7]
        const channelA = createVisibilityChannel(1, () => visibleA)
        const channelB = createVisibilityChannel(2, () => visibleB)
        const user = new User(undefined as any, undefined as any)
        user.id = 1

        user.subscribe(channelA)
        user.subscribe(channelB)

        const first = user.checkVisibility(1)
        const second = user.checkVisibility(2)
        visibleA = []
        const third = user.checkVisibility(3)

        expect(first.toCreate).toEqual([7, 7])
        expect(first.channelEntityCreates).toEqual([
            { nid: 7, channelId: 1 },
            { nid: 7, channelId: 2 }
        ])
        expect(second.toUpdate).toEqual([7, 7])
        expect(third.toDelete).toEqual([7])
        expect(third.toUpdate).toEqual([7])
    })

    it('forgets a channel visibility state when unsubscribing', () => {
        const visibleNids = [9]
        const channel = createVisibilityChannel(1, () => visibleNids)
        const user = new User(undefined as any, undefined as any)
        user.id = 1

        user.subscribe(channel)
        expect(user.checkVisibility(1).toCreate).toEqual([9])
        expect(user.checkVisibility(2).toUpdate).toEqual([9])

        user.unsubscribe(channel)
        user.subscribe(channel)

        const afterResubscribe = user.checkVisibility(3)
        expect(afterResubscribe.toDelete).toEqual([])
        expect(afterResubscribe.toCreate).toEqual([9])
    })
})
