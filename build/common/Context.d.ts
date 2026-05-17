import { Schema } from './binary/schema/Schema';
import { NetworkIdType } from './binary/Protocol';
export declare class Context {
    /**
     * user-defined network schemas
     */
    schemas: Map<number, Schema>;
    /**
     * schemas internal to nengi
     */
    engineSchemas: Map<number, Schema>;
    ntypeType: NetworkIdType;
    constructor();
    register(ntype: number, schema: Schema): void;
    getSchema(ntype: number): Schema;
    getEngineSchema(ntype: number): Schema;
}
//# sourceMappingURL=Context.d.ts.map