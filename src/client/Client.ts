import { Context } from '../common/Context'
import { Endpoint, RequestPolicy } from '../common/Endpoint'
import { ClientNetwork } from './ClientNetwork'
import type { InterpolationDelayReportOptions, CommandTimingOptions } from './ClientNetwork'
import { Predictor } from './prediction/Predictor'
import type { PredictionOperationOptions } from './prediction/Predictor'
import type { ClientAdapterConstructor, IClientNetworkAdapter } from './adapter/IClientNetworkAdapter'
import { getMonotonicTime, TimeSource } from '../common/time'

type StringOrParsedJSON = string | object
export type DisconnectHandler = (reason: StringOrParsedJSON, event?: any) => void
export type WebsocketErrorHandler = (event: any) => void
export type ClientConnectResult = {
    accepted: boolean
    reason?: unknown
}
export type RequestOptions<Response = any> = {
    timeoutMs?: number,
    key?: string,
    policy?: RequestPolicy,
    callback?: (response: Response) => any,
    prediction?: PredictionOperationOptions<Response>
}

export type ClientOptions = {
    now?: TimeSource
}

class Client<Adapter extends IClientNetworkAdapter = IClientNetworkAdapter> {
    context: Context
    network: ClientNetwork
    adapter: Adapter
    serverTickRate: number
    predictor: Predictor
    readonly now: TimeSource
    disconnectHandler: DisconnectHandler
    websocketErrorHandler: WebsocketErrorHandler

    constructor(context: Context, adapterCtor: ClientAdapterConstructor<Adapter>, serverTickRate: number, adapterConfig?: any, options: ClientOptions = {}) {
        this.context = context
        this.network = new ClientNetwork(this)
        this.adapter = new adapterCtor(this.network, adapterConfig)
        this.serverTickRate = serverTickRate
        this.now = options.now ?? getMonotonicTime
        this.predictor = new Predictor()

        this.disconnectHandler = (reason: StringOrParsedJSON, event: any) => {
            console.log('Disconnected!', reason, event)
        }
        this.websocketErrorHandler = (event: any) => {
            console.log('Websocket Error', event)
        }
    }

    connect(target: Parameters<Adapter['connect']>[0], handshake: any = {}): Promise<ClientConnectResult> {
        return this.adapter.connect(target, handshake)
    }

    disconnect(reason?: any) {
        this.adapter.disconnect?.(reason)
    }

    setDisconnectHandler(handler: DisconnectHandler) {
        this.disconnectHandler = handler
    }

    setWebsocketErrorHandler(handler: WebsocketErrorHandler) {
        this.websocketErrorHandler = handler
    }

    flush() {
        try {
            this.adapter.flush()
            this.network.flush()
        } catch (err) {
            this.network.rollbackOutbound()
            throw err
        }
    }

    addCommand(command: any) {
        this.network.addCommand(command)
    }

    /**
     * Sends a command with optional input/view timing metadata for server-side
     * lag compensation. Use ordinary addCommand when the server does not need
     * to know what the client was viewing when the input was authored.
     */
    addCommandWithTiming(command: any, options: CommandTimingOptions = {}) {
        this.network.addCommandWithTiming(command, options)
    }

    reportInterpolationDelay(delayMs: number, options: InterpolationDelayReportOptions = {}) {
        return this.network.reportInterpolationDelay(delayMs, options)
    }

    getEstimatedServerTimeMs(nowMs?: number) {
        return this.network.getEstimatedServerTimeMs(nowMs)
    }

    getClockSync() {
        return this.network.getClockSync()
    }

    predictCommand(command: any, options: PredictionOperationOptions = {}) {
        return this.network.predictCommand(command, options)
    }

    /**
     * Predicts locally and sends the command with timing metadata. This is the
     * command-replay path for movement, shooting, dodging, and similar actions
     * where reconciliation and lag compensation both matter.
     */
    predictCommandWithTiming(command: any, predictionOptions: PredictionOperationOptions = {}, timingOptions: CommandTimingOptions = {}) {
        return this.network.predictCommandWithTiming(command, predictionOptions, timingOptions)
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
