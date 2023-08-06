'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.findSubsequentFrame = exports.findInitialFrame = exports.Interpolator = void 0
const BinaryExt_1 = require('../common/binary/BinaryExt')
const findInitialFrame = (frames, renderTime) => {
    for (var i = frames.length - 1; i >= 0; i--) {
        var frame = frames[i]
        if (frame.timestamp < renderTime) {
            return frame
        }
    }
    return null
}
exports.findInitialFrame = findInitialFrame
const findSubsequentFrame = (frames, previousTick) => {
    for (var i = 0; i < frames.length; i++) {
        if (frames[i].tick === previousTick + 1) {
            return frames[i]
        }
    }
    return null
}
exports.findSubsequentFrame = findSubsequentFrame
class Interpolator {
    constructor(client) {
        this.client = client
    }
    getInterpolatedState(interpDelay) {
        const now = Date.now()
        const renderTime = now - interpDelay - this.client.network.chronus.averageTimeDifference
        const frameA = findInitialFrame(this.client.network.frames, renderTime)
        const frames = []
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
                    }
                    else {
                        tframes.splice(i, 1)
                    }
                }
            }
            frames.reverse()
            if (frameB && !frameB.processed) {
                const total = frameB.timestamp - frameA.timestamp
                const portion = renderTime - frameA.timestamp
                const interpAmount = portion / total
                const interpState = {
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
                    if (frameB.updateEntities.findIndex(x => x.nid === nid && x.prop === prop) === -1) {
                        interpState.updateEntities.push({ nid, prop, value })
                    }
                }
                for (let i = 0; i < frameB.updateEntities.length; i++) {
                    const { nid, prop } = frameB.updateEntities[i]
                    const entityA = frameA.entities.get(nid)
                    const entityB = frameB.entities.get(nid)
                    if (entityA && entityB) {
                        const nschema = this.client.context.getSchema(entityA.ntype)
                        const binarySpec = nschema.props[prop]
                        const binaryUtil = (0, BinaryExt_1.binaryGet)(binarySpec.type)
                        if (binarySpec.interp) {
                            // interpolated
                            const valueA = entityA[prop]
                            const valueB = entityB[prop]
                            const value = binaryUtil.interp(valueA, valueB, interpAmount)
                            interpState.updateEntities.push({ nid, prop, value })
                        }
                        else {
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
exports.Interpolator = Interpolator
//# sourceMappingURL=Interpolator.js.map