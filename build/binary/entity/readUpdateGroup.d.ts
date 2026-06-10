import { IBinaryReader } from '../../common/binary/IBinaryReader';
import { NetworkIdType } from '../../common/binary/Protocol';
import { Context } from '../../common/Context';
declare function readUpdateGroup(reader: IBinaryReader, context: Context, ntypes: Map<number, number>, nidType?: NetworkIdType): any[];
export default readUpdateGroup;
//# sourceMappingURL=readUpdateGroup.d.ts.map