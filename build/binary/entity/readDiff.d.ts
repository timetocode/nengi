import { IBinaryReader } from '../../common/binary/IBinaryReader';
import { Context } from '../../common/Context';
declare function readDiff(reader: IBinaryReader, context: Context, ntypes: Map<number, number>): {
    nid: number;
    prop: any;
    value: any;
};
export default readDiff;
//# sourceMappingURL=readDiff.d.ts.map