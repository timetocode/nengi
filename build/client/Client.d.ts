import { Context } from '../common/Context';
import { ClientNetwork } from './ClientNetwork';
type StringOrParsedJSON = string | Object;
type DisconnectHandler = (reason: StringOrParsedJSON, event?: any) => void;
type WebsocketErrorHandler = (event: any) => void;
declare class Client {
    context: Context;
    network: ClientNetwork;
    adapter: any;
    disconnectHandler: DisconnectHandler;
    websocketErrorHandler: WebsocketErrorHandler;
    constructor(context: Context, adapterCtor: any);
    connect(wsUrl: string, handshake: any): Promise<any>;
    setDisconnectHandler(handler: DisconnectHandler): void;
    setWebsocketErrorHandler(handler: WebsocketErrorHandler): void;
    flush(): void;
    addCommand(command: any): void;
}
export { Client };
