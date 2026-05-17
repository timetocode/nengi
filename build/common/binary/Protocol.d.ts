import { Binary } from './Binary';
import { IBinaryReader } from './IBinaryReader';
import { IBinaryWriter } from './IBinaryWriter';
type NetworkIdType = Binary.UInt8 | Binary.UInt16 | Binary.UInt32;
type ProtocolConfig = {
    nidType: NetworkIdType;
    ntypeType: NetworkIdType;
};
declare const DEFAULT_PROTOCOL: ProtocolConfig;
declare function maxValueForNetworkType(type: NetworkIdType): 255 | 65535 | 4294967295;
declare function byteSizeOfNetworkType(type: NetworkIdType): 1 | 2 | 4;
declare function networkTypeForMaxValue(maxValue: number): NetworkIdType;
declare function nextNetworkType(type: NetworkIdType): NetworkIdType | null;
declare function assertNetworkIdType(type: Binary): asserts type is NetworkIdType;
declare function writeNetworkId(value: number, type: NetworkIdType, writer: IBinaryWriter): void;
declare function readNetworkId(type: NetworkIdType, reader: IBinaryReader): number;
export { DEFAULT_PROTOCOL, NetworkIdType, ProtocolConfig, assertNetworkIdType, byteSizeOfNetworkType, maxValueForNetworkType, networkTypeForMaxValue, nextNetworkType, readNetworkId, writeNetworkId };
//# sourceMappingURL=Protocol.d.ts.map