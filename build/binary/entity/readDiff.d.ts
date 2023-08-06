import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'
import { IEntity } from '../../common/IEntity'
declare function readDiff(reader: IBinaryReader, context: Context, entities: Map<number, IEntity>): {
    nid: number;
    prop: any;
    value: any;
};
export default readDiff
