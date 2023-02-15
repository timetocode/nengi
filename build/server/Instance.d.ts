import { Channel } from './Channel';
import { Context } from '../common/Context';
import LocalState from './LocalState';
import { InstanceNetwork } from './InstanceNetwork';
import { User } from './User';
import { SpatialChannel } from './SpatialChannel';
import IChannel from './IChannel';
import EntityCache from './EntityCache';
import IEntity from '../common/IEntity';
import { IBinaryWriterClass } from '../common/binary/IBinaryWriter';
declare class Instance {
    context: Context;
    localState: LocalState;
    channelId: number;
    channels: Set<IChannel>;
    network: InstanceNetwork;
    users: Map<number, User>;
    cache: EntityCache;
    tick: number;
    responseEndPoints: Map<number, (body: any, send: (response: any) => void) => any>;
    bufferConstructor: IBinaryWriterClass;
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
    constructor(context: Context, bufferConstructor: IBinaryWriterClass);
    attachEntity(parentNid: number, child: IEntity): void;
    detachEntity(parentNid: number, child: IEntity): void;
    respond(endpoint: number, callback: (body: any, send: (response: any) => void) => any): void;
    createChannel(): Channel;
    createSpatialChannel(): SpatialChannel;
    step(): void;
}
export { Instance };
