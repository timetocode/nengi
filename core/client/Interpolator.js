import getValue from '../protocol/getValue'
import Binary from '../binary/Binary'

const cacheUpdateCheck = (cache, update, value, config) => {
    const id = update[config.ID_PROPERTY_NAME]
    if (!cache[id]) {
        cache[id] = {}
    }

    if (cache[id][update.prop] !== value) {
        cache[id][update.prop] = value
        return true
    }
    return false
}

const lerp = function (a, b, portion) {
    return a + ((b - a) * portion)
}

const findInitialSnapshot = function (snapshots, renderTime) {
    for (var i = snapshots.length - 1; i >= 0; i--) {
        var snapshot = snapshots[i]
        if (snapshot.timestamp < renderTime) {
            return { snapshot: snapshot, index: i }
        }
    }
    return null
}


const interpolateSnapshots = (snapshots, currTimestamp, cache, predictor, config) => {
    //console.log('PREDICTIONS', predictor)
    let init = findInitialSnapshot(snapshots, currTimestamp)
    if (!init) {
        return null
    }
    let snapshotA = init.snapshot
    let snapshotB = null
    let late = []
    if (snapshotA) {
        for (var i = 0; i < snapshots.length; i++) {
            if (snapshots[i].tick === snapshotA.tick + 1) {
                snapshotB = snapshots[i]
            }
        }

        //if (snapshotA.tick - 1 > lastProcessedTick) {
        // TODO: does this get checked more than it ought to be?
        for (var i = snapshots.length - 1; i > -1; i--) {
            let snapshot = snapshots[i]

            if (snapshot.tick < snapshotA.tick && !snapshot.processed) {
                late.push(snapshot)
                snapshot.processed = true
            }
        }
        // }

        late.reverse()

        // update the cache based on released late snapshots        
        for (var j = 0; j < late.length; j++) {
            const lateSnapshot = late[j]
            for (var k = 0; k < lateSnapshot.updateEntities.length; k++) {
                const lateUpdate = lateSnapshot.updateEntities[k]
                cacheUpdateCheck(cache, lateUpdate, lateUpdate.value, config)
            }
        }
    }

    if (snapshotB) {
        let total = snapshotB.timestamp - snapshotA.timestamp
        let portion = currTimestamp - snapshotA.timestamp
        let ratio = portion / total

        let interpState = {
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }

        if (!snapshotA.processed) {
            interpState.createEntities = snapshotA.createEntities.slice()
            interpState.deleteEntities = snapshotA.deleteEntities.slice()
            interpState.updateEntities = [] //snapshotA.updateEntities.slice()
            snapshotA.processed = true
            predictor.cleanUp(snapshotA.clientTick - 1)

            for (var i = 0; i < snapshotA.deleteEntities.length; i++) {
                delete cache[snapshotA.deleteEntities[i]]
            }

        }


        for (let i = 0; i < snapshotA.updateEntities.length; i++) {
            const update = snapshotA.updateEntities[i]

            if (!snapshotB.containsUpdateFor(update[config.ID_PROPERTY_NAME], update.prop)) {
                if (cacheUpdateCheck(cache, update, update.value, config)) {
                    interpState.updateEntities.push(update)
                    continue
                }
            }
        }

        for (let i = 0; i < snapshotB.updateEntities.length; i++) {
            // key interpolations to changes in frameB
            const update = snapshotB.updateEntities[i]
            const id = update[config.ID_PROPERTY_NAME]
            // console.log('up', update)
            //console.log('ssa', snapshotA.clientTick, snapshotB.clientTick)

            const entityA = snapshotA.entities.get(id)
            const entityB = snapshotB.entities.get(id)

            const propData = entityA.protocol.properties[update.prop]
            const binaryType = Binary[propData.type]

            if (predictor.has(snapshotA.clientTick, update[config.ID_PROPERTY_NAME], update.prop)) {
                //console.log('this value was predicted, skip')
                continue
            }

            if (predictor.has(snapshotB.clientTick, update[config.ID_PROPERTY_NAME], update.prop)) {
                //console.log('this value was predicted, skip')
                continue
            }


            if (entityA && entityB) {
                if (propData.interp && snapshotB.noInterps.indexOf(id) === -1) {
                    // CASE: entity value is marked for interp and changed in both A and B, correct value is interpolated
                    const valueA = getValue(entityA, update.path)
                    const valueB = getValue(entityB, update.path)
                    //if (valueA === valueB) {
                       // continue
                    //}
       
                    let valueInterp = valueA
                    // options for binary types that have custom interpolation logic
                    if (binaryType.interp) {
                        valueInterp = binaryType.interp(valueA, valueB, ratio)
                    } else {
                        valueInterp = lerp(valueA, valueB, ratio)
                    }

                    if (cacheUpdateCheck(cache, update, valueInterp, config)) {
                        interpState.updateEntities.push({
                            [config.ID_PROPERTY_NAME]: id,
                            prop: update.prop,
                            path: update.path,
                            value: valueInterp
                        })
                    }
                } else {
                    // CASE: entity value is flagged not to be interpolated, correct value is B
                    if (cacheUpdateCheck(cache, update, update.value, config)) {
                        interpState.updateEntities.push(update)
                        continue
                    }
                }
            } else {
                //console.log('only one')
            }
        }

        /*
        for (var i = 0; i < interpState.deleteEntities.length; i++) {
            delete cache[interpState.deleteEntities[i]]
        }
        */

        late.push(interpState)
    }


    return {
        snapshotA: snapshotA,
        snapshotB: snapshotB,
        late: late
    }
}

class Interpolator {
    constructor(config) {
        this.config = config
        this.lastProcessedTick = -1
        this.cache = {}
    }

    interp(snapshots, timestamp, predictions) { 
        let timeframe = interpolateSnapshots(snapshots, timestamp, this.cache, predictions, this.config)
        if (!timeframe) {
            return {
                latest: [],
                messages: [],
                localMessages: [],
                jsons: [],
                entities: []
            }
        }


        if (timeframe.late.length > 1) {
            //console.log(timeframe.late.length, 'late aaabbb')
        }
        // TODO: compare the number of late frames to master, and double check timesyncing math
        let ents = timeframe.late.slice(0, timeframe.late.length)

        if (timeframe.snapshotA && !timeframe.snapshotA.processed) {
            //console.log(timeframe.snapshotA.deleteEntities)
            //ents.push(timeframe.snapshotA)
        }


        return {
            latest: [],
            messages: [],
            localMessages: [],
            jsons: [],
            entities: ents
        }

        // console.log(timeframe)



    }
}

export default Interpolator