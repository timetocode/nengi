import { IEntity } from '../../IEntity';
import { Schema, SchemaUpdateGroup } from './Schema';
/**
 * Copies an object based on an nschema, copies only the properties listed in the nschema
 * @param entity
 * @param nschema
 * @returns the copied object
 */
export declare function copyNObject(entity: IEntity, nschema: Schema): IEntity;
/**
 * Copies the networked properties from source to target
 * @param source
 * @param target
 * @param nschema
 */
export declare function updateNObject(source: IEntity, target: IEntity, nschema: Schema): void;
export type EntityChange = {
    nid: number;
    nschema: Schema;
    prop: string;
    value: any;
};
export type EntityUpdateGroup = {
    nid: number;
    nschema: Schema;
    group: SchemaUpdateGroup;
    values: any[];
};
export type EntityDiffResult = {
    changes: EntityChange[];
    groups: EntityUpdateGroup[];
};
/**
 * Compares two IEntities looking only at the properties in the nschema and returns any changes
 * @param current
 * @param previous
 * @param nschema
 * @returns
 */
export declare function compareAndUpdateNObject(current: IEntity, previous: IEntity, nschema: Schema): EntityChange[];
/**
 * Diff variant for grouped entity updates. The default group mode is "any":
 * the first changed property in a group emits the whole group and the remaining
 * properties in that group are skipped for this entity. That is deliberately a
 * CPU optimization for transform-like data where x/y/z/rotation usually move
 * together and checking every field before deciding to bundle would lose much
 * of the benefit.
 */
export declare function compareAndUpdateNObjectGrouped(current: IEntity, previous: IEntity, nschema: Schema): EntityDiffResult;
//# sourceMappingURL=util.d.ts.map