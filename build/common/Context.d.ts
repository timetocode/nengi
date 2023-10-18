import { Schema } from './binary/schema/Schema';
export declare class Context {
    /**
     * user-defined network schemas
     */
    schemas: {
        [prop: number]: Schema;
    };
    /**
     * schemas internal to nengi
     */
    engineSchemas: {
        [prop: number]: Schema;
    };
    constructor();
    register(ntype: number, schema: Schema): void;
    registerEngineSchema(engineMessageType: number, schema: Schema): void;
    getSchema(ntype: number): Schema;
    getEngineSchema(ntype: number): Schema;
}
//# sourceMappingURL=Context.d.ts.map