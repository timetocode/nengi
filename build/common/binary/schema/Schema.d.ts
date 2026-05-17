declare class Schema {
    keys: any[];
    props: {
        [key: string]: any;
    };
    kind: 'entity' | 'message' | 'payload';
    constructor(kind?: 'entity' | 'message' | 'payload');
}
export { Schema };
//# sourceMappingURL=Schema.d.ts.map