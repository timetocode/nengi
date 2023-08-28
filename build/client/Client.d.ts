import { Context } from '../common/Context';
import { ClientNetwork } from './ClientNetwork';
import { Predictor } from './prediction/Predictor';
type StringOrParsedJSON = string | object;
type DisconnectHandler = (reason: StringOrParsedJSON, event?: any) => void;
type WebsocketErrorHandler = (event: any) => void;
declare class Client {
    context: Context;
    network: ClientNetwork;
    adapter: any;
    serverTickRate: number;
    predictor: Predictor;
    disconnectHandler: DisconnectHandler;
    websocketErrorHandler: WebsocketErrorHandler;
    constructor(context: Context, adapterCtor: any, serverTickRate: number);
    connect(wsUrl: string, handshake: any): Promise<any>;
    setDisconnectHandler(handler: DisconnectHandler): void;
    setWebsocketErrorHandler(handler: WebsocketErrorHandler): void;
    flush(): void;
    addCommand(command: any): void;
}
export { Client };
//# sourceMappingURL=Client.d.ts.map