/// <reference types="node" />
import { Instance } from './Instance';
import { NetworkEvent } from '../common/binary/NetworkEvent';
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter';
import { User } from './User';
import { IBinaryReader } from '../common/binary/IBinaryReader';
import { IBinaryWriterClass } from '../common/binary/IBinaryWriter';
interface INetworkEvent {
    type: NetworkEvent;
    user: User;
    command?: any;
}
declare class InstanceNetwork {
    instance: Instance;
    networkAdapter: IServerNetworkAdapter | null;
    constructor(instance: Instance);
    registerNetworkAdapter(networkAdapter: IServerNetworkAdapter): void;
    send(user: User, buffer: Buffer): void;
    onRequest(): void;
    onOpen(user: User): void;
    onCommand(user: User, command: any): void;
    onHandshake(user: User, handshake: any, binaryWriterCtor: IBinaryWriterClass): Promise<void>;
    onMessage(user: User, binaryReader: IBinaryReader, binaryWriterCtor: IBinaryWriterClass): void;
    onConnectionAccepted(user: User, payload: any): void;
    onConnectionDenied(user: User, payload: any): void;
    onClose(user: User): void;
}
export { InstanceNetwork, INetworkEvent };
