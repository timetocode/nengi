import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { NetworkIdType } from '../../common/binary/Protocol';
import { EntityUpdateGroup } from '../../common/binary/schema/util';
declare function writeUpdateGroup(update: EntityUpdateGroup, writer: IBinaryWriter, nidType?: NetworkIdType): void;
export default writeUpdateGroup;
//# sourceMappingURL=writeUpdateGroup.d.ts.map