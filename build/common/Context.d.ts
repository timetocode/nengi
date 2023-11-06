import { Schema } from './binary/schema/Schema';
export declare class Context {
    /**
     * user-defined network schemas
     */
    schemas: Map<number, Schema>;
    /**
     * schemas internal to nengi
     */
    engineSchemas: Map<number, Schema>;
    constructor();
    register(ntype: number, schema: Schema): void;
    getSchema(ntype: number): Schema | undefined;
    getEngineSchema(ntype: number): Schema | undefined;
}
//# sourceMappingURL=Context.d.ts.map