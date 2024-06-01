import { PredictionEntity } from './PredictionEntity'

class PredictionFrame {
    tick: number
    entityPredictions: Map<number, PredictionEntity>

    constructor(tick: number) {
        this.tick = tick
        this.entityPredictions = new Map()
    }

    add(nid: number, entity: any, props: string[]) {
        let entityPrediction = this.entityPredictions.get(nid)
        if (!entityPrediction) {
            entityPrediction = new PredictionEntity(nid, entity, props)
            this.entityPredictions.set(nid, entityPrediction)
        } else {
            entityPrediction.state = entity
            entityPrediction.props = props
        }
    }
}

export { PredictionFrame }
