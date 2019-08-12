import proxify from '../protocol/proxify.js';

const EPSILON = 0.0001

const closeEnough = (value) => {
    return value < EPSILON && value > -EPSILON
}

class PredictionErrorFrame {
    constructor(tick, config) {
        this.config = config
        this.tick = tick
        this.entities = new Map()
    }

    add(nid, entity, predictionError) {
        let entityPredictionError = this.entities.get(nid)
        if (!entityPredictionError) {
            entityPredictionError = new PredictionErrorEntity(nid, entity, this.config)
            this.entities.set(nid, entityPredictionError)
        }
        entityPredictionError.add(predictionError)
    }
}

class PredictionErrorEntity {
    constructor(nid, entity, config) {
        this[config.ID_PROPERTY_NAME] = nid
        this.proxy = entity
        this.errors = []
    }

    add(predictionError) {
        this.errors.push(predictionError)
    }
}

class PredictionErrorProperty {
    constructor(nid, prop, predictedValue, actualValue, deltaValue, config) {
        this[config.ID_PROPERTY_NAME] = nid
        this.prop = prop
        this.predictedValue = predictedValue
        this.actualValue = actualValue
        this.deltaValue = deltaValue
    }
}

class PredictionFrame {
    constructor(tick, config) {
        this.config = config
        this.tick = tick
        this.entityPredictions = new Map()
    }

    add(nid, entity, props) {
        let entityPrediction = this.entityPredictions.get(nid)
        if (!entityPrediction) {
            entityPrediction = new EntityPrediction(nid, entity, props, this.config)
            this.entityPredictions.set(nid, entityPrediction)
        } else {
            entityPrediction.entity = entity
            entityPrediction.props = props
        }
    }
}

class EntityPrediction {
    constructor(nid, entity, props, config) {
        this[config.ID_PROPERTY_NAME] = nid
        this.proxy = entity
        this.props = props
    }
}

class Predictor {
    constructor(config) {
        this.config = config
        this.predictionFrames = new Map()
        this.latestTick = -1
    }

    cleanUp(tick) {
       // let str = ''
        this.predictionFrames.forEach(predictionFrame => {
            //str += predictionFrame.tick + ' '
            //console.log(typeof tick, typeof predictionFrame.tick)
            if (predictionFrame.tick < tick - 50) {
                //console.log('delete a prediction frame b/c its old')
                this.predictionFrames.delete(predictionFrame.tick)
            }
        })

        
        //console.log(str)
    }

    addCustom(tick, entity, props) {
        let predictionFrame = this.predictionFrames.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick, this.config)
            this.predictionFrames.set(tick, predictionFrame)
        }
        let proxy = Object.assign({}, entity)
        //console.log('custom prediction registered', proxy)
        predictionFrame.add(entity[this.config.ID_PROPERTY_NAME], proxy, props)
    }

    add(tick, entity, props) {
        let predictionFrame = this.predictionFrames.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick, this.config)
            this.predictionFrames.set(tick, predictionFrame)
        }
        let proxy = proxify(entity, entity.protocol)
        //console.log('auto prediction registered', proxy)
        predictionFrame.add(entity[this.config.ID_PROPERTY_NAME], proxy, props)
    }

    has(tick, nid, prop) {
        let predictionFrame = this.predictionFrames.get(tick)
        if (predictionFrame) {
            let entityPrediction = predictionFrame.entityPredictions.get(nid)
            if (entityPrediction) {
                //console.log('prediction has', prop, entityPrediction.props.indexOf(prop !== -1))
                return entityPrediction.props.indexOf(prop) !== -1
            }
        }
        return false
    }

    getErrors(worldState) {
        let predictionErrorFrame = new PredictionErrorFrame(worldState.clientTick, this.config)
        if (worldState) {
            // predictions for this frame
            let predictionFrame = this.predictionFrames.get(worldState.clientTick)

            if (predictionFrame) {
                predictionFrame.entityPredictions.forEach(entityPrediction => {
                    // predictions for this entity
                    let nid = entityPrediction[this.config.ID_PROPERTY_NAME]
                    let authoritative = worldState.entities.get(nid)
                    if (authoritative) {
                        entityPrediction.props.forEach(prop => {
                            // evaluate a specific prediction
                            let authValue = authoritative[prop]
                            let predValue = entityPrediction.proxy[prop]
                            let diff = authValue - predValue

                            if (!closeEnough(diff)) {
                                predictionErrorFrame.add(
                                    nid, 
                                    entityPrediction.proxy,
                                    new PredictionErrorProperty(
                                        nid,
                                        prop,
                                        predValue,
                                        authValue,
                                        diff,
                                        this.config
                                    )
                                )
                            }
                        })
                    }
                })
            }
        }
        this.latestTick = worldState.clientTick
        return predictionErrorFrame
    }
}

export default Predictor;