import { Schema } from '../../common/binary/schema/Schema'

class PredictionEntity {
    nid: number
    proxy: any
    props: string[]
    nschema: Schema

    constructor(nid: number, entity: any, props: string[], nschema: Schema) {
        this.nid = nid
        this.proxy = entity
        this.props = props
        this.nschema = nschema
    }
}

export { PredictionEntity }