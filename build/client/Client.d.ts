import { Context } from '../common/Context';
import { ClientNetwork } from './ClientNetwork';
declare class Client {
    context: Context;
    network: ClientNetwork;
    adapter: any;
    constructor(context: Context, adapterCtor: any);
    connect(wsUrl: string, handshake: any): Promise<any>;
    flush(): void;
    addCommand(command: any): void;
}
export { Client };
