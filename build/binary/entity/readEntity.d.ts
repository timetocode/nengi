import { IBinaryReader } from '../../common/binary/IBinaryReader';
import { NetworkIdType } from '../../common/binary/Protocol';
import { Context } from '../../common/Context';
declare function readEntity(reader: IBinaryReader, context: Context, ntypeType?: NetworkIdType, nidType?: NetworkIdType): {
    nid: number;
    ntype: number;
};
export default readEntity;
//# sourceMappingURL=readEntity.d.ts.map