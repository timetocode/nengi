import { Client } from './Client'
import { Frame, IEntityFrame } from './Frame'
import { binaryGet } from '../common/binary/BinaryExt'

const findInitialFrame = (frames: Frame[], renderTime: number): Frame | null => {
    for (var i = frames.length - 1; i >= 0; i--) {
        var frame = frames[i]
        if (frame.timestamp < renderTime) {
            return frame
        }
    }
    return null
}

const findSubsequentFrame = (frames: Frame[], previousTick: number): Frame | null => {
    for (var i = 0; i < frames.length; i++) {
        if (frames[i].tick === previousTick + 1) {
            return frames[i]
        }
    }
    return null
}

class Interpolator {
    client: Client

    constructor(client: Client) {
        this.client = client
    }

    getInterpolatedState(interpDelay: number): IEntityFrame[] {
        const now = Date.now()
        const renderTime = now - interpDelay - this.client.network.chronus.averageTimeDifference

        const frameA = findInitialFrame(this.client.network.frames, renderTime)
        const frames: any[] = []

        const tframes = this.client.network.frames

        if (frameA) {
            const frameB = findSubsequentFrame(tframes, frameA.tick)
            //console.log('this.frames.length', frameA.tick, this.frames.length, renderTime)
            // late frames (frames before frameA)
            // TODO this.frames.length keeps growing! we need to free memory
            for (let i = tframes.length - 1; i > -1; i--) {
                const lateFrame = tframes[i]

                if (lateFrame.tick < frameA.tick && !lateFrame.processed) {
                    //console.log('late', lateFrame)
                    if (!lateFrame.processed) {
                        const processedLateFrame: IEntityFrame = {
                            createEntities: [],
                            updateEntities: [],
                            deleteEntities: [],
                        }
                        processedLateFrame.createEntities = lateFrame.createEntities
                        processedLateFrame.deleteEntities = lateFrame.deleteEntities

                        for (let i = 0; i < lateFrame.updateEntities.length; i++) {
                            const { nid, prop, value } = lateFrame.updateEntities[i]

                            //if (this.client.predictor.has(lateFrame.confirmedClientTick, nid, prop)) {
                            //    console.log('LATE this value was predicted, skip')
                            //    continue
                            //}


                            if (this.client.predictor.generalPrediction.has(nid)) {
                                // console.log('LATE yo!!!!!!!!!!!')
                                const propSet = this.client.predictor.generalPrediction.get(nid)
                                if (propSet!.has(prop)) {
                                    // console.log('skip b/c being predicted')
                                    continue
                                }
                            }

                            processedLateFrame.updateEntities.push(lateFrame.updateEntities[i])
                        }
                        frames.push(processedLateFrame)
                        lateFrame.processed = true
                        tframes.splice(i, 1)

                        // not sure if this is right, needs tested in lag
                        //console.log('cleaning up', frame.clientTick - 1)
                        this.client.predictor.cleanUp(lateFrame.confirmedClientTick - 1)
                    } else {
                        tframes.splice(i, 1)
                    }
                }
            }

            frames.reverse()

            if (!frameB) {
                //console.log('no frame b')
            }

            if (frameB && !frameB.processed) {
                const total = frameB.timestamp - frameA.timestamp
                const portion = renderTime - frameA.timestamp
                const interpAmount = portion / total

                // TODO type
                const interpState: IEntityFrame = {
                    createEntities: [],
                    updateEntities: [],
                    deleteEntities: [],
                }

                if (!frameA.processed) {
                    //console.log('processing frameA', frameA)
                    interpState.createEntities = frameA.createEntities.slice()
                    interpState.deleteEntities = frameA.deleteEntities.slice()
                    frameA.processed = true

                    // is this right...?
                    //console.log('cleaning up', frameA.clientTick -1)
                    //this.client.predictor.cleanUp(frameA.clientTick - 1)
                }

                for (let i = 0; i < frameA.updateEntities.length; i++) {
                    const { nid, prop, value } = frameA.updateEntities[i]


                    if (this.client.predictor.generalPrediction.has(nid)) {
                        //console.log('A yo!!!!!!!!!!!')
                        const propSet = this.client.predictor.generalPrediction.get(nid)
                        if (propSet!.has(prop)) {
                            // console.log('skip b/c being predicted')
                            continue
                        }
                    }
                    /*
                    if (this.client.predictor.has(frameA.confirmedClientTick, nid, prop)) {
                        console.log('this value was predicted, skip')
                        continue
                    }
                    if (this.client.predictor.has(frameB.confirmedClientTick, nid, prop)) {
                        console.log('this value was predicted, skip')
                        continue
                    } */

                    // if no update in frameB, then entity's correct state is update.value
                    if (frameB.updateEntities.findIndex(x => x.nid === nid && x.prop === prop) === -1) {
                        interpState.updateEntities.push({ nid, prop, value })
                    }
                }

                for (let i = 0; i < frameB.updateEntities.length; i++) {
                    const { nid, prop } = frameB.updateEntities[i]

                    //console.log('searching for prediction', frameA.clientTick, nid, prop)


                    if (this.client.predictor.generalPrediction.has(nid)) {
                        //console.log('B yo!!!!!!!!!!!')
                        const propSet = this.client.predictor.generalPrediction.get(nid)
                        if (propSet!.has(prop)) {
                            // console.log('skip b/c being predicted')
                            continue
                        }
                    }


                    /*
                    if (this.client.predictor.has(frameA.confirmedClientTick, nid, prop)) {
                        console.log('this value was predicted, skip')
                        continue
                    }
                    if (this.client.predictor.has(frameB.confirmedClientTick, nid, prop)) {
                        console.log('this value was predicted, skip')
                        continue
                    } */



                    const entityA = frameA.entities.get(nid)
                    const entityB = frameB.entities.get(nid)

                    if (entityA && entityB) {
                        const nschema = this.client.context.getSchema(entityA.ntype)!
                        const binarySpec = nschema.props[prop]
                        const binaryUtil = binaryGet(binarySpec.type)

                        if (binarySpec.interp) {
                            // interpolated
                            const valueA = entityA[prop]
                            const valueB = entityB[prop]
                            const value = binaryUtil.interp(valueA, valueB, interpAmount)
                            interpState.updateEntities.push({ nid, prop, value })
                        } else {
                            // not interpolated
                            interpState.updateEntities.push({ nid, prop, value: entityB[prop] })
                        }
                    }
                }
                frames.push(interpState)
            }
        }
        return frames
    }
}

export { Interpolator, findInitialFrame, findSubsequentFrame }