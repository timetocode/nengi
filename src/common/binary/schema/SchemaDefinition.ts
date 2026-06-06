import { Binary } from '../Binary'


type ShorthandBinarySpecification = Binary
type LonghandBinarySpecification = { type: Binary, interp?: boolean }

type UpdateGroupDefinition =
    | string[]
    | {
        name?: string
        props: string[]
        mode?: 'any' | 'full'
    }

type SchemaOptions = {
    updateGroups?: { [name: string]: string[] | { props: string[], mode?: 'any' | 'full' } } | UpdateGroupDefinition[]
}

type SchemaDefinition = {
    [key: string]: ShorthandBinarySpecification | LonghandBinarySpecification | SchemaOptions | undefined
    $options?: SchemaOptions
}

export { SchemaDefinition, SchemaOptions, UpdateGroupDefinition }
