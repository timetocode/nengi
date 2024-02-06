import { Context } from '../common/Context'
import { IEntity } from '../common/IEntity'
import { binaryGet } from '../common/binary/BinaryExt'
import { copyNObject } from '../common/binary/schema/util'
import { NDictionary } from './NDictionary'

// TODO measure performance of Map vs other structures
export type HistorySnapshot = Map<number, IEntity>

export class Historian {
    context: Context
    tickRatePerSecond: number
    history: { [tick: number]: HistorySnapshot } = {}
    tick = 0
    ticksToStore = 0

    constructor(context: Context, tickRatePerSecond: number, ticksToStore?: number) {
        this.context = context
        this.tickRatePerSecond = tickRatePerSecond

        // default value is 2 seconds worth of ticks
        this.ticksToStore = tickRatePerSecond * 2
        if (ticksToStore) {
            // or use a user specified amount
            this.ticksToStore = ticksToStore
        }
    }

    record(tick: number, entities: NDictionary) {
        const snapshot: HistorySnapshot = new Map()
        for (let i = 0; i < entities.array.length; i++) {
            const entity = entities.array[i]
            snapshot.set(entity.nid, copyNObject(entity, this.context.getSchema(entity.ntype)))
        }
        this.history[tick] = snapshot
        this.tick = tick
        delete this.history[tick - (this.ticksToStore + 1)]

        /*
        let str = ''
        for (const prop in this.history) {
            str += `${prop}[${this.history[prop].size}]|`
        }
        console.log('historian states', str)
        */
    }

    /**
     * Gets past state of entities from the frame nearest the time requested, lower performance cost
     * @param millisecondsAgo
     * @returns Map<nid, IEntity>
     */
    getFastLagCompensatedState(millisecondsAgo: number): HistorySnapshot {
        const tickLengthMs = 1000 / this.tickRatePerSecond
        const ticksAgo = millisecondsAgo / tickLengthMs
        const olderTick = this.tick - Math.floor(ticksAgo)
        const newerTick = olderTick + 1
        const portion = (millisecondsAgo % tickLengthMs) / tickLengthMs
        const snapshotA = this.history[olderTick]
        const snapshotB = this.history[newerTick]
        return (portion >= 0.5) ? snapshotB : snapshotA
    }

    /**
     * Gets past state of entities computed as a position between frames, moderate performance cost
     * @param millisecondsAgo
     * @returns Map<nid, IEntity>
     */
    getComputedLagCompensatedState(millisecondsAgo: number) {
        const tickLengthMs = 1000 / this.tickRatePerSecond
        const ticksAgo = millisecondsAgo / tickLengthMs

        const olderTick = this.tick - Math.floor(ticksAgo)
        const newerTick = olderTick + 1
        const portion = (millisecondsAgo % tickLengthMs) / tickLengthMs

        const snapshotA = this.history[olderTick]
        const snapshotB = this.history[newerTick]
        const snapshotC: HistorySnapshot = new Map()

        if (snapshotA && snapshotB) {
            snapshotA.forEach((entityA, nid) => {
                const entityB = snapshotB.get(nid)
                if (entityA && entityB) {
                    const computed: IEntity = { nid, ntype: entityA.ntype }
                    const nschema = this.context.getSchema(computed.ntype)

                    for (let i = 0; i < nschema.keys.length; i++) {
                        const { prop } = nschema.keys[i]
                        const binarySpec = nschema.props[prop]
                        const binaryUtil = binaryGet(binarySpec.type)
                        const valueA = entityA[prop]
                        const valueB = entityB[prop]
                        if (binarySpec.interp) {
                            // interpolated
                            const value = binaryUtil.interp(valueA, valueB, portion)
                            computed[prop] = value
                        } else {
                            // not interpolated, go with with nearest state
                            // arguably this should always be valueA...
                            if (portion < 0.5) {
                                computed[prop] = valueA
                            } else {
                                computed[prop] = valueB
                            }
                        }
                    }
                    snapshotC.set(nid, computed)
                }
            })
        }
        return snapshotC
    }
}