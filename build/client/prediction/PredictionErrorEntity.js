'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.PredictionErrorEntity = void 0
class PredictionErrorEntity {
    constructor(nid, entity) {
        this.nid = nid
        this.proxy = entity
        this.errors = []
    }
    add(predictionError) {
        this.errors.push(predictionError)
    }
}
exports.PredictionErrorEntity = PredictionErrorEntity
//# sourceMappingURL=PredictionErrorEntity.js.map