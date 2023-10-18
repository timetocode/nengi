import { LocalState } from './LocalState';
import { ICulledChannel, VisibilityResolver } from './IChannel';
import { Channel } from './Channel';
export declare class CulledChannel<VisibleObjectType, ViewType> extends Channel implements ICulledChannel<VisibleObjectType, ViewType> {
    views: Map<number, ViewType>;
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>;
    constructor(localState: LocalState, ntype: number);
    addMessage(message: any): void;
    getVisibileEntities(userId: number): number[];
}
//# sourceMappingURL=CulledChannel.d.ts.map