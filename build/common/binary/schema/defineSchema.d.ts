import { Schema } from './Schema';
import { SchemaDefinition } from './SchemaDefinition';
declare function defineEntitySchema(schema: SchemaDefinition): Schema;
declare function defineMessageSchema(schema: SchemaDefinition): Schema;
declare function definePayloadSchema(schema: SchemaDefinition): Schema;
declare const createEntity: typeof defineEntitySchema;
declare const createMessage: typeof defineMessageSchema;
export { createEntity, createMessage, defineEntitySchema, defineMessageSchema, definePayloadSchema };
//# sourceMappingURL=defineSchema.d.ts.map