import { Schema } from '../../common/binary/schema/Schema';
declare class EntityPrediction {
    nid: number;
    proxy: any;
    props: string[];
    nschema: Schema;
    constructor(nid: number, entity: any, props: string[], nschema: Schema);
}
export { EntityPrediction };
