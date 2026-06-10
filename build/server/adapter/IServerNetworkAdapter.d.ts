import { BinaryAdapter, BinaryPayload } from '../../common/binary/BinaryAdapter';
import { User } from '../User';
interface IServerNetworkAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload, ListenOptions = number> {
    binary: BinaryAdapter<InboundPayload, OutboundPayload>;
    listen(options: ListenOptions, ready?: () => void): void;
    send(user: User, buffer: OutboundPayload): void;
    disconnect(user: User, reason: any): void;
}
export { IServerNetworkAdapter };
//# sourceMappingURL=IServerNetworkAdapter.d.ts.map