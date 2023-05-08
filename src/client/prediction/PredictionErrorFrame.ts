import { PredictionErrorEntity } from './PredictionErrorEntity'
import { PredictionErrorProperty } from './PredictionErrorProperty'

class PredictionErrorFrame {
    tick: number
    entities: Map<number, any>

    constructor(tick: number) {
        this.tick = tick
        this.entities = new Map()
    }

    add(nid: number, entity: any, predictionError: PredictionErrorProperty) {
        let entityPredictionError = this.entities.get(nid)
        if (!entityPredictionError) {
            entityPredictionError = new PredictionErrorEntity(nid, entity)
            this.entities.set(nid, entityPredictionError)
        }
        entityPredictionError.add(predictionError)
    }
}

export { PredictionErrorFrame }