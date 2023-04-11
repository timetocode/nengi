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
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter';
import { BinaryWriterFactory } from '../common/binary/BinaryWriterFactory';
import { BinaryReaderFactory } from '../common/binary/BinaryReaderFactory';
declare class Instance {
    context: Context;
    localState: LocalState;
    channelId: number;
    incrementalUserId: number;
    channels: Set<IChannel>;
    networks: InstanceNetwork[];
    users: Map<number, User>;
    cache: EntityCache;
    tick: number;
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
    constructor(context: Context, bufferConstructor: IBinaryWriterClass);
    registerNetworkAdapter(networkAdapter: IServerNetworkAdapter, binaryWriterFactory: BinaryWriterFactory, binaryReaderFactory: BinaryReaderFactory): void;
    attachEntity(parentNid: number, child: IEntity): void;
    detachEntity(parentNid: number, child: IEntity): void;
    respond(endpoint: number, callback: (body: any, send: (response: any) => void) => any): void;
    createChannel(): Channel;
    createSpatialChannel(): SpatialChannel;
    step(): void;
}
export { Instance };
