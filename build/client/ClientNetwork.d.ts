import { IEntity } from '../common/IEntity';
import { NQueue } from '../NQueue';
import { Client } from './Client';
import { Snapshot } from './Snapshot';
import { IBinaryWriterClass } from '../common/binary/IBinaryWriter';
import { IBinaryReader } from '../common/binary/IBinaryReader';
import { Chronus } from './Chronus';
import { Outbound } from './Outbound';
import { Frame } from './Frame';
declare class ClientNetwork {
    client: Client;
    entities: Map<number, IEntity>;
    snapshots: Snapshot[];
    frames: Frame[];
    latestFrame: Frame | null;
    outbound: Outbound;
    messages: any[];
    predictionErrorFrames: any[];
    socket: WebSocket | null;
    requestId: number;
    requestQueue: NQueue<any>;
    requests: Map<number, any>;
    clientTick: number;
    previousSnapshot: Snapshot | null;
    chronus: Chronus;
    onDisconnect: (reason: any, event?: any) => void;
    onSocketError: (event: any) => void;
    constructor(client: Client);
    incrementClientTick(): void;
    addEngineCommand(command: any): void;
    addCommand(command: any): void;
    request(endpoint: number, payload: any, callback: (response: any) => any): void;
    createHandshakeBuffer(handshake: any, binaryWriterCtor: IBinaryWriterClass): any;
    createOutboundBuffer(binaryWriterCtor: IBinaryWriterClass): any;
    readSnapshot(dr: IBinaryReader): void;
}
export { ClientNetwork };
