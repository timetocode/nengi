import { IEntity } from '../common/IEntity'
import { Snapshot } from './Snapshot'

interface IEntityFrame {
    createEntities: IEntity[]
    updateEntities: any[]
    deleteEntities: number[]
}

let tick = 0 // TODO this should be the server tick not a client based count

class Frame implements IEntityFrame {
    tick: number
    timestamp: number
    processed: boolean
    entities: Map<number, IEntity>

    createEntities: IEntity[]
    updateEntities: any[]
    deleteEntities: number[]

    constructor(snapshot: Snapshot, previousFrame: Frame | null) {
        this.tick = tick++
        this.timestamp = snapshot.timestamp
        this.processed = false
        this.entities = new Map()

        this.createEntities = []
        this.updateEntities = []
        this.deleteEntities = []

        if (previousFrame) {
           // this.timestamp = previousFrame.timestamp + 50
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

export { Frame, IEntityFrame}