import { Binary } from '../Binary';
import { binaryGet } from '../BinaryExt';
export type SchemaProp = {
    key: number;
    prop: string;
    type: Binary;
    interp: boolean;
    binary: ReturnType<typeof binaryGet>;
    updateGroup?: SchemaUpdateGroup;
};
export type SchemaUpdateGroupMode = 'any' | 'full';
export type SchemaUpdateGroup = {
    key: number;
    name: string;
    mode: SchemaUpdateGroupMode;
    props: SchemaProp[];
    lastEmitGeneration: number;
};
declare class Schema {
    keys: SchemaProp[];
    props: {
        [key: string]: SchemaProp;
    };
    updateGroups: SchemaUpdateGroup[];
    updateGroupGeneration: number;
    kind: 'entity' | 'message' | 'payload';
    constructor(kind?: 'entity' | 'message' | 'payload');
}
export { Schema };
//# sourceMappingURL=Schema.d.ts.map