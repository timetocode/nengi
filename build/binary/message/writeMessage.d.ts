import { Schema } from '../../common/binary/schema/Schema'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
declare function writeMessage(obj: any, nschema: Schema, bufferWriter: IBinaryWriter): void;
export { writeMessage }
