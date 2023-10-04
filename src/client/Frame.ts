import { IEntity } from '../common/IEntity'
import { Snapshot } from './Snapshot'

export interface IEntityFrame {
    createEntities: IEntity[]
    updateEntities: any[]
    deleteEntities: number[],
}

export class Frame implements IEntityFrame {
    tick: number
    confirmedClientTick: number
    timestamp: number
    processed: boolean = false // whether create/deletes have been processed
    once: boolean = false // whether this frame has been used for interpolation once
    entities: Map<number, IEntity> = new Map()

    createEntities: IEntity[] = []
    updateEntities: any[] = []
    deleteEntities: number[] = []

    constructor(tick: number, snapshot: Snapshot, previousFrame: Frame | null) {
        this.tick = tick
        this.confirmedClientTick = snapshot.confirmedClientTick
        this.timestamp = snapshot.timestamp

        if (previousFrame) {
            previousFrame.entities.forEach(entity => {
                const clone = Object.assign({}, entity)
                this.entities.set(clone.nid, clone)
            })
        }

        snapshot.createEntities.forEach(entity => {
            const clone = Object.assign({}, entity)
            this.entities.set(clone.nid, clone)
            this.createEntities.push(clone)
        })

        snapshot.updateEntities.forEach(update => {
            const entity = this.entities.get(update.nid)!
            entity[update.prop] = update.value
            const clone = Object.assign({}, update)
            this.updateEntities.push(clone)
        })

        snapshot.deleteEntities.forEach(nid => {
            this.entities.delete(nid)
            this.deleteEntities.push(nid)
        })
    }
}
