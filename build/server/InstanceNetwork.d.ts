import { Instance } from './Instance';
import NQueue from '../NQueue';
import { NetworkEvent } from '../common/binary/NetworkEvent';
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter';
import { User } from './User';
import { IBinaryReader } from '../common/binary/IBinaryReader';
import { IBinaryWriterClass } from '../common/binary/IBinaryWriter';
import { BinaryWriterFactory } from '../common/binary/BinaryWriterFactory';
import { BinaryReaderFactory } from '../common/binary/BinaryReaderFactory';
interface INetworkEvent {
    type: NetworkEvent;
    user: User;
    command?: any;
}
declare class InstanceNetwork {
    instance: Instance;
    networkAdapter: IServerNetworkAdapter;
    binaryWriterFactory: BinaryWriterFactory;
    binaryReaderFactory: BinaryReaderFactory;
    queue: NQueue<INetworkEvent>;
    constructor(instance: Instance, networkAdapter: IServerNetworkAdapter, binaryWriterFactory: BinaryWriterFactory, binaryReaderFactory: BinaryReaderFactory);
    send(user: User, buffer: any): void;
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
