import { BinaryAdapter, BinaryPayload } from '../../common/binary/BinaryAdapter'
import { User } from '../User'

interface IServerNetworkAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> {
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
	listen(port: number, ready: () => void): void
	send(user: User, buffer: OutboundPayload): void
	disconnect(user: User, reason: any): void
}

export { IServerNetworkAdapter }
