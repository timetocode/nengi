import { Binary } from '../Binary'
type ShorthandBinarySpecification = Binary;
type LonghandBinarySpecification = {
    type: Binary;
    interp: boolean;
    groups?: [[string]];
};
type SchemaDefinition = {
    [key: string]: ShorthandBinarySpecification | LonghandBinarySpecification;
};
export { SchemaDefinition }
