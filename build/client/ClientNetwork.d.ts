import IEntity from '../common/IEntity';
import NQueue from '../NQueue';
import { Client } from './Client';
import { Snapshot } from './Snapshot';
import { IBinaryWriterClass } from '../common/binary/IBinaryWriter';
import { IBinaryReader } from '../common/binary/IBinaryReader';
declare class ClientNetwork {
    client: Client;
    entities: Map<number, IEntity>;
    snapshots: Snapshot[];
    outbound: NQueue<any>;
    messages: any[];
    socket: WebSocket | null;
    requestId: number;
    requestQueue: NQueue<any>;
    requests: Map<number, any>;
    constructor(client: Client);
    addCommand(command: any): void;
    request(endpoint: number, payload: any, callback: (response: any) => any): void;
    createHandshakeBuffer(handshake: any, binaryWriterCtor: IBinaryWriterClass): any;
    createOutboundBuffer(binaryWriterCtor: IBinaryWriterClass): any;
    readSnapshot(dr: IBinaryReader): void;
}
export { ClientNetwork };
