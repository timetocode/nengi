'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.PredictionErrorFrame = void 0
const PredictionErrorEntity_1 = require('./PredictionErrorEntity')
class PredictionErrorFrame {
    constructor(tick) {
        this.tick = tick
        this.entities = new Map()
    }
    add(nid, entity, predictionError) {
        let entityPredictionError = this.entities.get(nid)
        if (!entityPredictionError) {
            entityPredictionError = new PredictionErrorEntity_1.PredictionErrorEntity(nid, entity)
            this.entities.set(nid, entityPredictionError)
        }
        entityPredictionError.add(predictionError)
    }
}
exports.PredictionErrorFrame = PredictionErrorFrame
//# sourceMappingURL=PredictionErrorFrame.js.map