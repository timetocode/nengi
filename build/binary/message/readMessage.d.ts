import { IBinaryReader } from '../../common/binary/IBinaryReader';
import { NetworkIdType } from '../../common/binary/Protocol';
import { Context } from '../../common/Context';
declare function readMessage(reader: IBinaryReader, context: Context, ntypeType?: NetworkIdType): {
    ntype: number;
};
export default readMessage;
//# sourceMappingURL=readMessage.d.ts.map