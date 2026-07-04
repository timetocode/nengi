import { BinaryAdapter, BinaryPayload } from '../../common/binary/BinaryAdapter'

interface IClientNetworkAdapter<
    InboundPayload extends BinaryPayload = BinaryPayload,
    OutboundPayload extends BinaryPayload = InboundPayload,
    ConnectTarget = unknown
> {
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
    connect(target: ConnectTarget, handshake?: any): Promise<any>
    flush(): void
    disconnect?(reason?: any): void
}

type ClientAdapterConstructor<
    Adapter extends IClientNetworkAdapter = IClientNetworkAdapter
> = new (network: any, config?: any) => Adapter

export { IClientNetworkAdapter, ClientAdapterConstructor }
