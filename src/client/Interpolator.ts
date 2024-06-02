import { Client } from './Client'
import { Frame, IEntityFrame } from './Frame'
import { binaryGet } from '../common/binary/BinaryExt'

export const findInitialFrame = (frames: Frame[], renderTime: number): Frame | null => {
    for (let i = frames.length - 1; i >= 0; i--) {
        const frame = frames[i]
        if (frame.timestamp < renderTime) {
            return frame
        }
    }
    return null
}

export const findSubsequentFrame = (frames: Frame[], previousTick: number): Frame | null => {
    for (let i = 0; i < frames.length; i++) {
        if (frames[i].tick === previousTick + 1) {
            return frames[i]
        }
    }
    return null
}


export class Interpolator {
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
            for (let i = tframes.length - 1; i > -1; i--) {
                const lateFrame = tframes[i]
                if (lateFrame.tick < frameA.tick) {
                    if (!lateFrame.processed) {
                        frames.push(lateFrame)
                        lateFrame.processed = true
                        tframes.splice(i, 1)
                        this.client.predictor.cleanUp(lateFrame.confirmedClientTick - 1)
                    } else {
                        tframes.splice(i, 1)
                    }
                }
            }

            frames.reverse()

            if (frameB && !frameB.processed) {
                const total = frameB.timestamp - frameA.timestamp
                const portion = renderTime - frameA.timestamp
                const interpAmount = portion / total

                const interpState: IEntityFrame = {
                    from: frameA.tick,
                    to: frameB.tick,
                    fromConfirmed: frameA.confirmedClientTick,
                    toConfirmed: frameB.confirmedClientTick,
                    createEntities: [],
                    updateEntities: [],
                    deleteEntities: [],
                }

                if (!frameA.processed) {
                    interpState.createEntities = frameA.createEntities.slice()
                    interpState.deleteEntities = frameA.deleteEntities.slice()
                    frameA.processed = true
                    this.client.predictor.cleanUp(frameA.confirmedClientTick - 1)
                }

                for (let i = 0; i < frameA.updateEntities.length; i++) {
                    const { nid, prop, value } = frameA.updateEntities[i]
                    // if no update in frameB, then entity's correct state is update.value
                    // this represents the final state of interpolation, the frame after there is no longer a change
                    // and is how state arrives at the exact correct value
                    // this only occurs once, otherwise it would be emit the same value repeatedly
                    if (!frameB.once && frameB.updateEntities.findIndex(x => x.nid === nid && x.prop === prop) === -1) {

                        // todo actually make sure we are working on a specific PROPERTY
                        // not all of the entity state
                        //if (this.client.predictor.isPredicted(nid, prop, frameA.confirmedClientTick)) {
//
                        //}
                        /*
                        if (this.client.predictor.isTickPredictedForEntity(nid, frameA.confirmedClientTick)) {
                            if (this.client.predictor.predictionRange.has(nid)) {
                                console.log('state change ending for something under prediction', nid, 'on tick', frameA.confirmedClientTick, 'range was', this.client.predictor.predictionRange.get(nid))
                                if (this.client.predictor.predictionRange.get(nid)!.end === frameA.confirmedClientTick) {
                                    console.log('yo prediction end right here', frameA.confirmedClientTick)
                                }
                            }
                            //if (this.client.predictor.obliviousPredictions.has(frameA.confirmedClientTick)) {
                             //   this.client.predictor.obliviousPredictions.get(frameA.confirmedClientTick)!.entityPredictions.has(nid)
                            //}
                            continue
                            //console.log('entity has prediction in frameB')
                        }
                        */
                        const entityA = frameA.entities.get(nid)!
                        const nschema = this.client.context.getSchema(entityA.ntype)!
                        const binarySpec = nschema.props[prop]
                        
                        //console.log('state change ends', { nid, prop, value }, frameA.confirmedClientTick, frameB.confirmedClientTick)
                        //console.log('range', this.client.predictor.predictionRange.get(nid))

                        if (this.client.predictor.predictionRange.get(nid)) {
                            const propRange = this.client.predictor.predictionRange.get(nid)!
                            if (propRange.has(prop)) {
                               const range = propRange.get(prop)!
                               if (this.client.predictor.detached.has(range.end)) {
                                    const entityPrediction = this.client.predictor.detached.get(range.end)!.entityPredictions.get(nid)!
                            
                                    //console.log('last prediction...', entityPrediction.state[prop], 'vs', entityA[prop])
                                    continue
                                }
                            }                           
                        }
                      
                        if (binarySpec.interp) {
                            interpState.updateEntities.push({ nid, prop, value })
                        } else {
                            // we skip this final state of interpolation for non-interpolated values if they have
                            // already been emitted
                            if (!frameA.once) {
                                // does this ever actually happen...?
                                interpState.updateEntities.push({ nid, prop, value })
                            }
                        }
                    }
                }

                for (let i = 0; i < frameB.updateEntities.length; i++) {
                    const { nid, prop } = frameB.updateEntities[i]

                    const entityA = frameA.entities.get(nid)
                    const entityB = frameB.entities.get(nid)

                    if (entityA && entityB) {
                        const nschema = this.client.context.getSchema(entityA.ntype)!
                        const binarySpec = nschema.props[prop]
                        const binaryUtil = binaryGet(binarySpec.type)


                        // TODO if either the frame before or after our current point in interpolation is predicted we
                        // just skip everything for the entity... but what we should really do are
                        // 1) operate on specific properties, not a whole entitiy
                        // 2) lerp from predicted state to interpolated state...? consider this
                        /*
                        if (this.client.predictor.isTickPredictedForEntity(nid, frameA.confirmedClientTick)) {
                            //console.log('entity has prediction in frameA')
                            continue
                        }
                        if (!this.client.predictor.isTickPredictedForEntity(nid, frameA.confirmedClientTick) && this.client.predictor.isTickPredictedForEntity(nid, frameB.confirmedClientTick)) {
                            //continue
                            //console.log('entity has prediction in frameB')
                            console.log('prediction ends this frame')
                        }

                        if (this.client.predictor.isTickPredictedForEntity(nid, frameA.confirmedClientTick) && 
                            this.client.predictor.isTickPredictedForEntity(nid, frameB.confirmedClientTick)) {
                            continue
                            //console.log('entity has prediction in frameB')
                        }
                        */

                        if (this.client.predictor.isPredicted(nid, prop, frameA.confirmedClientTick) && 
                            this.client.predictor.isPredicted(nid, prop, frameB.confirmedClientTick)) {
                                //console.log('predicted in A and B', frameA.confirmedClientTick, frameB.confirmedClientTick)
                                continue
                        }

                        if (this.client.predictor.isPredicted(nid, prop, frameA.confirmedClientTick) && 
                            !this.client.predictor.isPredicted(nid, prop, frameB.confirmedClientTick)) {
                                //console.log('predicted in A and NOT B', frameA.confirmedClientTick, frameB.confirmedClientTick)
                                continue
                        }

        
                        if (!this.client.predictor.isPredicted(nid, prop, frameA.confirmedClientTick) && 
                            this.client.predictor.isPredicted(nid, prop, frameB.confirmedClientTick)) {
                                //console.log('predicted in NOT A and B', frameA.confirmedClientTick, frameB.confirmedClientTick)
                                continue
                        }

                        if (binarySpec.interp) {
                            // interpolated
                            const valueA = entityA[prop]
                            const valueB = entityB[prop]
                            const value = binaryUtil.interp(valueA, valueB, interpAmount)
                            interpState.updateEntities.push({ nid, prop, value })
                        } else {
                            if (!frameB.once) {
                                // not interpolated, !once prevents redundantly emission of the value which isn't going to change
                                // more than once between frameA to frameB
                                interpState.updateEntities.push({ nid, prop, value: entityB[prop] })
                            }
                        }
                    }
                }
                frameB.once = true
                frames.push(interpState)
            }
        }
        return frames
    }
}
