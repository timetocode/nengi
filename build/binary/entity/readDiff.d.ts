import { IBinaryReader } from '../../common/binary/IBinaryReader';
import { NetworkIdType } from '../../common/binary/Protocol';
import { Context } from '../../common/Context';
declare function readDiff(reader: IBinaryReader, context: Context, ntypes: Map<number, number>, nidType?: NetworkIdType): {
    nid: number;
    prop: string;
    value: any;
};
export default readDiff;
//# sourceMappingURL=readDiff.d.ts.map