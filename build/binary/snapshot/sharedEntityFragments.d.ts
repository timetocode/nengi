import { BinaryPayload } from '../../common/binary/BinaryAdapter';
import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { Instance } from '../../server/Instance';
import { User } from '../../server/User';
import { SharedUpdateChannel } from './channelModes';
export type EntityDeltaFragments = {
    creates: {
        payload: BinaryPayload;
        bytes: number;
        creates: number;
        nids: Set<number>;
    } | null;
    deletes: {
        payload: BinaryPayload;
        bytes: number;
        deletes: number;
        nids: Set<number>;
    } | null;
};
export declare function writeEntityDeltaFragments(writer: IBinaryWriter, instance: Instance, fragments: EntityDeltaFragments): void;
export declare function countEntityDeltaFragmentBytes(fragments: EntityDeltaFragments): number;
export declare function countEntityDeltaFragmentCreates(fragments: EntityDeltaFragments): number;
export declare function countEntityDeltaFragmentDeletes(fragments: EntityDeltaFragments): number;
export declare function applySharedChannelDeltasToUser(user: User, channel: SharedUpdateChannel, tick: number, fragments: EntityDeltaFragments): void;
export declare function canUseSharedDeltaFragments(user: User, channel: SharedUpdateChannel): boolean;
export declare function getEntityDeltaFragments(user: User, instance: Instance, channel: SharedUpdateChannel): EntityDeltaFragments;
export declare function getSharedUpdateFragment(user: User, instance: Instance, channel: SharedUpdateChannel, excludedNids?: Set<number>): {
    payload: any;
    bytes: number;
    updateProps: number;
    updateGroups: number;
    groupedUpdateProps: number;
};
//# sourceMappingURL=sharedEntityFragments.d.ts.map