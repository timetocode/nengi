import { Context } from '../common/Context'
import { ClientNetwork } from './ClientNetwork'

class Client {
    context: Context
    network: ClientNetwork
    adapter: any

    constructor(context: Context, adapterCtor: any) {
        this.context = context
        this.network = new ClientNetwork(this)
        this.adapter = new adapterCtor(this.network)
    }

    connect(wsUrl: string, handshake: any): Promise<any> {
       return this.adapter.connect(wsUrl, handshake)
    }

    flush() {
        this.adapter.flush()
    }

    addCommand(command: any) {
        this.network.addCommand(command)
    }
}

export { Client }