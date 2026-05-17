import { Instance } from '../../server/Instance';
import { User } from '../../server/User';
import { collectSnapshotPlan } from './collectSnapshotPlan';
import { commitSnapshotPlan } from './commitSnapshotPlan';
import { countSnapshotBytes } from './countSnapshotBytes';
import { writeSnapshot } from './writeSnapshot';
declare const createSnapshotBufferRefactor: (user: User, instance: Instance) => import("../..").BinaryPayload;
export default createSnapshotBufferRefactor;
export { collectSnapshotPlan, collectSnapshotPlan as getVisibleState };
export { commitSnapshotPlan, countSnapshotBytes, writeSnapshot };
export type { SnapshotPlan, SnapshotResponse } from './SnapshotPlan';
//# sourceMappingURL=createSnapshotBufferRefactor.d.ts.map