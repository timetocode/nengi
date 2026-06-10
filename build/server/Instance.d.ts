import { Context } from '../common/Context';
import { LocalState } from './LocalState';
import { INetworkEvent, InstanceNetwork } from './InstanceNetwork';
import { User } from './User';
import { EntityCache } from './EntityCache';
import { IEntity } from '../common/IEntity';
import { NQueue } from '../NQueue';
import { Endpoint, EndpointDefinition } from '../common/Endpoint';
type ResponseSender<Response = any> = (response: Response) => void;
type ResponseHandlerArgs<Request = any> = {
    user: User;
    body: Request;
};
type ResponseHandler<Request = any, Response = any> = (request: ResponseHandlerArgs<Request>, send: ResponseSender<Response>) => Response | void | Promise<Response | void>;
export type ResponseEndpoint = {
    endpoint: EndpointDefinition | null;
    callback: ResponseHandler;
};
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
    responseEndPoints: Map<number, ResponseEndpoint>;
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
    attachChild(parent: IEntity, child: IEntity): IEntity;
    detachChild(parent: IEntity, child: IEntity): void;
    markDirty(entity: IEntity): boolean;
    respond<Request = any, Response = any>(endpoint: Endpoint<Request, Response>, callback: ResponseHandler<Request, Response>): void;
    step(): void;
}
export {};
//# sourceMappingURL=Instance.d.ts.map