import { LocalState } from './LocalState'
import { ICulledChannel, CulledChannelSubscriptionHandler, VisibilityResolver } from './IChannel'
import { Channel } from './Channel'

export class CulledChannel<VisibleObjectType, ViewType> extends Channel implements ICulledChannel<VisibleObjectType, ViewType>  {
    views: Map<number, ViewType>
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>

    constructor(localState: LocalState, ntype: number) {
        super(localState, ntype)
        this.views = new Map()
        this.visibilityResolver = (object: VisibleObjectType, view: ViewType) => { return true }
    }

    addMessage(message: any) {
        this.users.forEach(user => {
            if (this.visibilityResolver(message, this.views.get(user.id)!)) {
                user.queueMessage(message)
            }
        })
    }

    getVisibileEntities(userId: number) {
        const view = this.views.get(userId)!
        const visibleNids: number[] = []
        this.localState.children.get(this.channelEntity.nid)!.forEach((entity: any) => {
            if (this.visibilityResolver(entity, view)) {
                visibleNids.push(entity.nid)
            }
        })
        return visibleNids
    }
}
