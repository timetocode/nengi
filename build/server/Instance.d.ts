import { Context } from '../common/Context';
import { LocalState } from './LocalState';
import { INetworkEvent, InstanceNetwork } from './InstanceNetwork';
import { User } from './User';
import { EntityCache } from './EntityCache';
import { IEntity } from '../common/IEntity';
import { NQueue } from '../NQueue';
export declare class Instance {
    context: Context;
    localState: LocalState;
    network: InstanceNetwork;
    queue: NQueue<INetworkEvent>;
    users: Map<number, User>;
    incrementalUserId: number;
    cache: EntityCache;
    tick: number;
    pingIntervalMs: number;
    responseEndPoints: Map<number, (body: any, send: (response: any) => void) => any>;
    /**
     *
     * @param handshake test test
     * ```ts
     * instance.onConnect = async (handshake: any) => {
     *      return await authenticateUser(handshake)
     * }
     * ```
     */
    onConnect: (handshake: any) => Promise<any>;
    constructor(context: Context);
    attachEntity(parentNid: number, child: IEntity): void;
    detachEntity(parentNid: number, child: IEntity): void;
    respond(endpoint: number, callback: (body: any, send: (response: any) => void) => any): void;
    step(): void;
}
//# sourceMappingURL=Instance.d.ts.map