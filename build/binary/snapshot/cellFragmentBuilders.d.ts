import { Instance } from '../../server/Instance';
import { User } from '../../server/User';
import { CellFragmentChannel, ManualSpatialCellFragmentChannel } from './channelModes';
import { CellEntityFragment } from './cellEntityFragments';
export declare function applyCellEntityFragmentsToUser(user: User, tick: number, createFragments: CellEntityFragment[], deleteFragments: CellEntityFragment[]): void;
export declare function getCellCreateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string): CellEntityFragment;
export declare function getCellDeleteFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, nids: number[]): CellEntityFragment;
export declare function getManualSpatialCellUpdateFragment(user: User, instance: Instance, channel: ManualSpatialCellFragmentChannel, cellKey: string, includeNids?: boolean): CellEntityFragment;
export declare function getCellUpdateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, includeNids?: boolean): CellEntityFragment;
export declare function cellMayHaveUpdates(channel: CellFragmentChannel, cellKey: string): boolean;
//# sourceMappingURL=cellFragmentBuilders.d.ts.map