import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { Schema } from '../../common/binary/schema/Schema';
declare function writeDiffs(nid: number, diffs: any, nschema: Schema, bufferWriter: IBinaryWriter): void;
export default writeDiffs;
