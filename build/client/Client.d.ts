import { Context } from '../common/Context';
import { Endpoint, RequestPolicy } from '../common/Endpoint';
import { ClientNetwork } from './ClientNetwork';
import { Predictor } from './prediction/Predictor';
type StringOrParsedJSON = string | object;
type DisconnectHandler = (reason: StringOrParsedJSON, event?: any) => void;
type WebsocketErrorHandler = (event: any) => void;
type RequestOptions<Response = any> = {
    timeoutMs?: number;
    key?: string;
    policy?: RequestPolicy;
    callback?: (response: Response) => any;
};
declare class Client {
    context: Context;
    network: ClientNetwork;
    adapter: any;
    serverTickRate: number;
    predictor: Predictor;
    disconnectHandler: DisconnectHandler;
    websocketErrorHandler: WebsocketErrorHandler;
    constructor(context: Context, adapterCtor: any, serverTickRate: number, adapterConfig?: any);
    connect(wsUrl: string, handshake: any): Promise<any>;
    setDisconnectHandler(handler: DisconnectHandler): void;
    setWebsocketErrorHandler(handler: WebsocketErrorHandler): void;
    flush(): void;
    addCommand(command: any): void;
    request<Request = any, Response = any>(endpoint: Endpoint<Request, Response>, payload: Request, callbackOrOptions?: ((response: Response) => any) | RequestOptions<Response>): Promise<Response>;
}
export { Client };
//# sourceMappingURL=Client.d.ts.map