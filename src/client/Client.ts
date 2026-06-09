import { Context } from '../common/Context'
import { Endpoint, RequestPolicy } from '../common/Endpoint'
import { ClientNetwork } from './ClientNetwork'
import { Predictor } from './prediction/Predictor'
import type { PredictionOperationOptions } from './prediction/Predictor'

type StringOrParsedJSON = string | object
type DisconnectHandler = (reason: StringOrParsedJSON, event?: any) => void
type WebsocketErrorHandler = (event: any) => void
type RequestOptions<Response = any> = {
    timeoutMs?: number,
    key?: string,
    policy?: RequestPolicy,
    callback?: (response: Response) => any,
    prediction?: PredictionOperationOptions<Response>
}

class Client {
    context: Context
    network: ClientNetwork
    adapter: any
    serverTickRate: number
    predictor: Predictor
    disconnectHandler: DisconnectHandler
    websocketErrorHandler: WebsocketErrorHandler

    constructor(context: Context, adapterCtor: any, serverTickRate: number, adapterConfig?: any) {
        this.context = context
        this.network = new ClientNetwork(this)
        this.adapter = new adapterCtor(this.network, adapterConfig)
        this.serverTickRate = serverTickRate
        this.predictor = new Predictor()

        this.disconnectHandler = (reason: StringOrParsedJSON, event: any) => {
            console.log('Disconnected!', reason, event)
        }
        this.websocketErrorHandler = (event: any) => {
            console.log('Websocket Error', event)
        }
    }

    connect(wsUrl: string, handshake: any): Promise<any> {
        return this.adapter.connect(wsUrl, handshake)
    }

    setDisconnectHandler(handler: DisconnectHandler) {
        this.disconnectHandler = handler
    }

    setWebsocketErrorHandler(handler: WebsocketErrorHandler) {
        this.websocketErrorHandler = handler
    }

    flush() {
        this.adapter.flush()
        this.network.flush()
    }

    addCommand(command: any) {
        this.network.addCommand(command)
    }

    predictCommand(command: any, options: PredictionOperationOptions = {}) {
        return this.network.predictCommand(command, options)
    }

    predictState(payload: any, options: PredictionOperationOptions = {}) {
        return this.network.predictState(payload, options)
    }

    request<Request = any, Response = any>(
        endpoint: Endpoint<Request, Response>,
        payload: Request,
        callbackOrOptions?: ((response: Response) => any) | RequestOptions<Response>
    ) {
        return this.network.request(endpoint, payload, callbackOrOptions)
    }
}

export { Client }
