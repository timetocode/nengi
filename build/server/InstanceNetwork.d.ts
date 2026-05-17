import { Instance } from './Instance';
import { NetworkEvent } from '../common/binary/NetworkEvent';
import { User } from './User';
import { EngineMessage } from '../common/EngineMessage';
import { BinaryPayload } from '../common/binary/BinaryAdapter';
import { ProtocolConfig } from '../common/binary/Protocol';
import type { ResponseEndpoint } from './Instance';
export interface INetworkEvent {
    type: NetworkEvent;
    user: User;
    commands?: any;
    clientTick?: number;
}
export type ResponseBacklogInfo = {
    user: User;
    queued: number;
    sent: number;
    remaining: number;
    tick: number;
};
export declare class InstanceNetwork {
    instance: Instance;
    responseBacklogUsers: Set<User>;
    onResponseBacklog: (info: ResponseBacklogInfo) => void;
    constructor(instance: Instance);
    onRequest(): void;
    getProtocol(): ProtocolConfig;
    createProtocolEngineMessage(): {
        ntype: EngineMessage;
        nidType: import("../common/binary/Protocol").NetworkIdType;
        ntypeType: import("../common/binary/Protocol").NetworkIdType;
    };
    queueProtocolIfChanged(user: User): void;
    queueResponse(user: User, requestId: number, endpoint: ResponseEndpoint, response: any): void;
    queueErrorResponse(user: User, requestId: number, code: string, message: string): void;
    reportResponseBacklog(user: User, queued: number, sent: number): void;
    runRequestHandler(user: User, requestId: number, endpoint: ResponseEndpoint, body: any): void;
    onOpen(user: User): void;
    onHandshake(user: User, handshake: any): Promise<void>;
    onMessage(user: User, buffer: BinaryPayload): void;
    onConnectionAccepted(user: User, payload: any): void;
    onConnectionDenied(user: User, payload: any): void;
    onClose(user: User): void;
}
//# sourceMappingURL=InstanceNetwork.d.ts.map