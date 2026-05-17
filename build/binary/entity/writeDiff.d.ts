import { Schema } from '../../common/binary/schema/Schema';
import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { NetworkIdType } from '../../common/binary/Protocol';
declare function writeDiff(nid: number, diff: any, nschema: Schema, bufferWriter: IBinaryWriter, nidType?: NetworkIdType): void;
export default writeDiff;
//# sourceMappingURL=writeDiff.d.ts.map