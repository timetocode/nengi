import { Binary } from '../Binary'

type ShorthandBinarySpecification = Binary
type LonghandBinarySpecification = { type: Binary, interp: Boolean, groups?: [[string]] }

type SchemaDefinition = {
    [key: string]: ShorthandBinarySpecification | LonghandBinarySpecification
}

export { SchemaDefinition }