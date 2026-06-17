import { Context } from '../common/Context';
import { Endpoint, RequestPolicy } from '../common/Endpoint';
import { ClientNetwork } from './ClientNetwork';
import type { InterpolationDelayReportOptions, CommandTimingOptions } from './ClientNetwork';
import { Predictor } from './prediction/Predictor';
import type { PredictionOperationOptions } from './prediction/Predictor';
import type { ClientAdapterConstructor, IClientNetworkAdapter } from './adapter/IClientNetworkAdapter';
type StringOrParsedJSON = string | object;
type DisconnectHandler = (reason: StringOrParsedJSON, event?: any) => void;
type WebsocketErrorHandler = (event: any) => void;
type RequestOptions<Response = any> = {
    timeoutMs?: number;
    key?: string;
    policy?: RequestPolicy;
    callback?: (response: Response) => any;
    prediction?: PredictionOperationOptions<Response>;
};
declare class Client<Adapter extends IClientNetworkAdapter = IClientNetworkAdapter> {
    context: Context;
    network: ClientNetwork;
    adapter: Adapter;
    serverTickRate: number;
    predictor: Predictor;
    disconnectHandler: DisconnectHandler;
    websocketErrorHandler: WebsocketErrorHandler;
    constructor(context: Context, adapterCtor: ClientAdapterConstructor<Adapter>, serverTickRate: number, adapterConfig?: any);
    connect(target: Parameters<Adapter['connect']>[0], handshake: any): Promise<any>;
    disconnect(reason?: any): void;
    setDisconnectHandler(handler: DisconnectHandler): void;
    setWebsocketErrorHandler(handler: WebsocketErrorHandler): void;
    flush(): void;
    addCommand(command: any): void;
    /**
     * Sends a command with optional input/view timing metadata for server-side
     * lag compensation. Use ordinary addCommand when the server does not need
     * to know what the client was viewing when the input was authored.
     */
    addCommandWithTiming(command: any, options?: CommandTimingOptions): void;
    reportInterpolationDelay(delayMs: number, options?: InterpolationDelayReportOptions): boolean;
    predictCommand(command: any, options?: PredictionOperationOptions): import("./prediction/PredictionLog").PredictionOperation<any>;
    /**
     * Predicts locally and sends the command with timing metadata. This is the
     * command-replay path for movement, shooting, dodging, and similar actions
     * where reconciliation and lag compensation both matter.
     */
    predictCommandWithTiming(command: any, predictionOptions?: PredictionOperationOptions, timingOptions?: CommandTimingOptions): import("./prediction/PredictionLog").PredictionOperation<any>;
    predictState(payload: any, options?: PredictionOperationOptions): import("./prediction/PredictionLog").PredictionOperation<any>;
    request<Request = any, Response = any>(endpoint: Endpoint<Request, Response>, payload: Request, callbackOrOptions?: ((response: Response) => any) | RequestOptions<Response>): Promise<Response>;
}
export { Client };
//# sourceMappingURL=Client.d.ts.map