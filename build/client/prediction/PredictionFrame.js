'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.PredictionFrame = void 0
const PredictionEntity_1 = require('./PredictionEntity')
class PredictionFrame {
    constructor(tick) {
        this.tick = tick
        this.entityPredictions = new Map()
    }
    add(nid, entity, props, nschema) {
        //console.log('prediction created', this.tick, nid, entity, props)
        let entityPrediction = this.entityPredictions.get(nid)
        if (!entityPrediction) {
            entityPrediction = new PredictionEntity_1.PredictionEntity(nid, entity, props, nschema)
            this.entityPredictions.set(nid, entityPrediction)
        }
        else {
            entityPrediction.proxy = entity
            entityPrediction.props = props
        }
    }
}
exports.PredictionFrame = PredictionFrame
//# sourceMappingURL=PredictionFrame.js.map