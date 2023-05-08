import { Context } from '../common/Context'
import { ClientNetwork } from './ClientNetwork'
import { Predictor } from './prediction/Predictor'

type StringOrParsedJSON = string | Object
type DisconnectHandler = (reason: StringOrParsedJSON, event?: any) => void
type WebsocketErrorHandler = (event: any) => void

class Client {
    context: Context
    network: ClientNetwork
    adapter: any
    serverTickRate: number
    predictor: Predictor
    disconnectHandler: DisconnectHandler
    websocketErrorHandler: WebsocketErrorHandler

    constructor(context: Context, adapterCtor: any, serverTickRate: number) {
        this.context = context
        this.network = new ClientNetwork(this)
        this.adapter = new adapterCtor(this.network)
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
    }

    addCommand(command: any) {
        this.network.addCommand(command)
    }
}

export { Client }