"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionFrame = void 0;
const EntityPrediction_1 = require("./EntityPrediction");
class PredictionFrame {
    constructor(tick) {
        this.tick = tick;
        this.entityPredictions = new Map();
    }
    add(nid, entity, props, nschema) {
        console.log('prediction created', this.tick, nid, entity, props);
        let entityPrediction = this.entityPredictions.get(nid);
        if (!entityPrediction) {
            entityPrediction = new EntityPrediction_1.EntityPrediction(nid, entity, props, nschema);
            this.entityPredictions.set(nid, entityPrediction);
        }
        else {
            entityPrediction.proxy = entity;
            entityPrediction.props = props;
        }
    }
}
exports.PredictionFrame = PredictionFrame;
//# sourceMappingURL=PredictionFrame.js.map