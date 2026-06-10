export type BinaryDebugFields = {
    phase?: 'count' | 'write' | 'read';
    section?: string;
    index?: number;
    ntype?: number;
    nid?: number;
    prop?: string;
    propKey?: number;
    binaryType?: number;
    offset?: number;
    value?: any;
};
export declare class BinaryDebugError extends Error {
    originalError: any;
    context: BinaryDebugFields;
    constructor(message: string, originalError: any, context: BinaryDebugFields);
}
export declare function createBinaryDebugError(originalError: any, context: BinaryDebugFields): BinaryDebugError;
//# sourceMappingURL=BinaryDebugError.d.ts.map