import { IEntity } from '../../IEntity';
import { Schema } from './Schema';
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
/**
 * Compares two IEntities looking only at the properties in the nschema and returns any changes
 * @param current
 * @param previous
 * @param nschema
 * @returns
 */
export declare function compareAndUpdateNObject(current: IEntity, previous: IEntity, nschema: Schema): EntityChange[];
//# sourceMappingURL=util.d.ts.map