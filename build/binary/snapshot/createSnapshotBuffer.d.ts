import { Instance } from '../../server/Instance';
import { User } from '../../server/User';
import { collectSnapshotPlan } from './collectSnapshotPlan';
import { commitSnapshotPlan } from './commitSnapshotPlan';
import { countSnapshotBytes } from './countSnapshotBytes';
import { writeSnapshot } from './writeSnapshot';
declare const createSnapshotBuffer: (user: User, instance: Instance) => any;
export default createSnapshotBuffer;
export { collectSnapshotPlan, collectSnapshotPlan as getVisibleState };
export { commitSnapshotPlan, countSnapshotBytes, writeSnapshot };
export type { SnapshotPlan, SnapshotResponse } from './SnapshotPlan';
//# sourceMappingURL=createSnapshotBuffer.d.ts.map