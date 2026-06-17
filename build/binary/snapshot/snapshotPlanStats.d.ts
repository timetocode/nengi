import { SnapshotPlan } from './SnapshotPlan';
type PlannedSnapshot = SnapshotPlan | {
    plan: SnapshotPlan;
};
export declare function sumPlanCreates(plans: PlannedSnapshot[]): number;
export declare function sumPlanDeletes(plans: PlannedSnapshot[]): number;
export declare function sumPlanUpdateProps(plans: PlannedSnapshot[]): number;
export declare function sumPlanUpdateGroups(plans: PlannedSnapshot[]): number;
export declare function sumPlanGroupedUpdateProps(plans: PlannedSnapshot[]): number;
export declare function countPlanMessages(plan: SnapshotPlan): number;
export declare function sumPlanMessages(plans: PlannedSnapshot[]): number;
export {};
//# sourceMappingURL=snapshotPlanStats.d.ts.map