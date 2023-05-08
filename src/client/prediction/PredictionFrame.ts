import { Schema } from '../../common/binary/schema/Schema'
import { PredictionEntity } from './PredictionEntity'

class PredictionFrame {
    tick: number
    entityPredictions: Map<number, PredictionEntity>

    constructor(tick: number) {
        this.tick = tick
        this.entityPredictions = new Map()
    }

    add(nid: number, entity: any, props: string[], nschema: Schema) {
        //console.log('prediction created', this.tick, nid, entity, props)
        let entityPrediction = this.entityPredictions.get(nid)
        if (!entityPrediction) {
            entityPrediction = new PredictionEntity(nid, entity, props, nschema)
            this.entityPredictions.set(nid, entityPrediction)
        } else {
            entityPrediction.proxy = entity
            entityPrediction.props = props
        }
    }
}

export { PredictionFrame }
