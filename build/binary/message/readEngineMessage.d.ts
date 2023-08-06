import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'
declare function readEngineMessage(reader: IBinaryReader, context: Context): {
    ntype: number;
};
export default readEngineMessage
