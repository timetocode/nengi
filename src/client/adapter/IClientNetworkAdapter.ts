import { BinaryAdapter, BinaryPayload } from '../../common/binary/BinaryAdapter'

export type ClientTransportHandlers<InboundPayload extends BinaryPayload = BinaryPayload> = {
    onOpen: () => void
    onMessage: (payload: InboundPayload) => void
    onClose: (detail?: unknown) => void
    onError: (cause: unknown) => void
}

interface IClientNetworkAdapter<
    InboundPayload extends BinaryPayload = BinaryPayload,
    OutboundPayload extends BinaryPayload = InboundPayload,
    ConnectTarget = unknown
> {
    readonly clientAdapterVersion: 2
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
    /** Transport only. Core sends and validates the nengi handshake. */
    open(target: ConnectTarget, handlers: ClientTransportHandlers<InboundPayload>): void
    /**
     * Throw or call onError on failure. While native close is pending, discard
     * sends and preserve onClose's detail instead of manufacturing a send error.
     * Returning does not acknowledge delivery; core still owns pending work.
     */
    send(payload: OutboundPayload): void
    /** Invalidate callbacks and delayed deliveries before closing the transport. */
    close(reason: string, force: boolean): void
}

type ClientAdapterConstructor<
    Adapter extends IClientNetworkAdapter = IClientNetworkAdapter
> = new (config?: any) => Adapter

export { IClientNetworkAdapter, ClientAdapterConstructor }
