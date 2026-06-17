import { Instance } from '../../server/Instance';
import { User } from '../../server/User';
import { BinaryPayload } from '../../common/binary/BinaryAdapter';
import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { ProtocolConfig } from '../../common/binary/Protocol';
type MessageFragment = {
    channelId: number;
    payload: BinaryPayload;
    bytes: number;
    messages: number;
};
export declare function collectBroadcastMessages(user: User): any[];
export declare function collectInterpolatedBroadcastMessages(user: User): any[];
export declare function getSharedMessageFragments(user: User, instance: Instance): MessageFragment[];
export declare function sumSharedMessageFragmentBytes(fragments: MessageFragment[], protocol: ProtocolConfig): number;
export declare function sumSharedMessageFragmentMessages(fragments: MessageFragment[]): number;
export declare function writeSharedMessageFragments(writer: IBinaryWriter, instance: Instance, fragments: MessageFragment[]): void;
export {};
//# sourceMappingURL=messageFragments.d.ts.map