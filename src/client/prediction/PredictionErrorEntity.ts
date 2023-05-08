import { PredictionErrorProperty } from './PredictionErrorProperty'

class PredictionErrorEntity {
    nid: number
    proxy: any
    errors: PredictionErrorProperty[]

    constructor(nid: number, entity: any) {
        this.nid = nid
        this.proxy = entity
        this.errors = []
    }

    add(predictionError: PredictionErrorProperty) {
        this.errors.push(predictionError)
    }
}

export { PredictionErrorEntity }