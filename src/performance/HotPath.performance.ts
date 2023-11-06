// @ts-nocheck
import { IChannel } from '../server/IChannel'
import { Channel } from '../server/Channel'
import { LocalState } from '../server/LocalState'
import { Instance } from '../server/Instance'
import { Context } from '../common/Context'
import { defineSchema } from '../common/binary/schema/defineSchema'
import { Binary } from '../common/binary/Binary'
import { IEntity } from '../common/IEntity'

type nid = number
type tick = number

export class User {
    id = 0
    subscriptions = new Map<number, IChannel>()
    tickLastSeen: { [prop: nid]: tick } = {}
    currentlyVisible: nid[] = []
    localState: LocalState

    constructor(localState: LocalState) {
        this.localState = localState
    }

    subscribe(channel: IChannel) {
        this.subscriptions.set(channel.nid, channel)
    }

    unsubscribe(channel: IChannel) {
        this.subscriptions.delete(channel.nid)
    }

    createOrUpdate(nid: number, tick: number, toCreate: number[], toUpdate: number[]) {
        if (!this.tickLastSeen[nid]) {
            //console.log('create push', id)
            toCreate.push(nid)
            this.tickLastSeen[nid] = tick
            this.currentlyVisible.push(nid)
        } else {
            this.tickLastSeen[nid] = tick
            toUpdate.push(nid)
        }

        const children = this.localState.children.get(nid)
        if (children) {
            for (const cid of children) {
                this.createOrUpdate(cid, tick, toCreate, toUpdate)
            }
            //children.forEach((cid: number) => this.createOrUpdate(cid, tick, toCreate, toUpdate))
        }
    }

    
    checkVisibility(tick: number) {
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []

        for (const [channelId, channel] of this.subscriptions.entries()) {
            const visibleNids = channel.getVisibleEntities(this.id)
            for (let i = 0; i < visibleNids.length; i++) {
                this.createOrUpdate(visibleNids[i], tick, toCreate, toUpdate)
            }
        }

        /*
        this.subscriptions.forEach(channel => {
            channel.getVisibileEntities(this.id).forEach(nid => {
                this.createOrUpdate(nid, tick, toCreate, toUpdate)
            })
        })
        */

        for (let i = this.currentlyVisible.length - 1; i > -1; i--) {
            const id = this.currentlyVisible[i]
            if (this.currentlyVisible[id] !== tick) {
                toDelete.push(id)
                this.currentlyVisible[id] = 0
                this.currentlyVisible.splice(i, 1)
            }
        }

        return { toDelete, toUpdate, toCreate }
    }


    createOrUpdate2(nid: number, tick: number, toCreate: number[], toUpdate: number[]) {
        // was this entity visible last frame?
        if (!this.tickLastSeen[nid]) {
            // no? well then this user needs to create it fully
            toCreate.push(nid)
            this.currentlyVisible.push(nid)
        } else {
            // yes? well then we just need any changes that have occurred            
            toUpdate.push(nid)
        }
        this.tickLastSeen[nid] = tick

        if (this.localState.children.has(nid)) {
            for (const cid of this.localState.children.get(nid)!) {
                this.createOrUpdate2(cid, tick, toCreate, toUpdate)
            }
        }
        /*
        const children = this.localState.children.get(nid)
        if (children) {
            for (const cid of children) {
                this.createOrUpdate(cid, tick, toCreate, toUpdate)
            }
        }
        */
    }

    populateDeletions(tick: number, toDelete: number[]) {
        for (let i = this.currentlyVisible.length - 1; i > -1; i--) {
            const nid = this.currentlyVisible[i]
            if (this.tickLastSeen[nid] !== tick) {
                toDelete.push(nid)
                delete this.tickLastSeen[nid] //= 0
                this.currentlyVisible.splice(i, 1)
            }
        }
    }

    checkVisibility2(tick: number) {
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []

        for (const [channelId, channel] of this.subscriptions.entries()) {
            const visibleNids = channel.getVisibleEntities(this.id)
            for (let i = 0; i < visibleNids.length; i++) {
                this.createOrUpdate2(visibleNids[i], tick, toCreate, toUpdate)
            }
        }

        this.populateDeletions(tick, toDelete)

        return { toDelete, toUpdate, toCreate }
    }
}


const getVisibleState = (user: User, instance: Instance) => {
    const { toCreate, toUpdate, toDelete } = user.checkVisibility2(instance.tick)

    const createEntities: any = []

    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i]
        const entity = instance.localState.getByNid(nid)
        const nschema = instance.context.getSchema(entity.ntype)!
        if (nschema) {
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema)
            }
            createEntities.push(entity)
        } else {
            throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`)
        }
    }

    //const engineMessages = user.engineMessageQueue
    // user.engineMessageQueue = []

    //const messages = user.messageQueue
    // empty the queue
    //user.messageQueue = []

    const deleteEntities: number[] = toDelete

    const updateEntities: any = []
    for (let i = 0; i < toUpdate.length; i++) {
        const nid = toUpdate[i]
        const entity = instance.localState.getByNid(nid)
        const nschema = instance.context.getSchema(entity.ntype)!        
        const diffs = instance.cache.getChangedProperties(instance.tick, entity, nschema)
        for (let j = 0; j < diffs.length; j++) {
            updateEntities.push(diffs[j])
        }       
    }

    return {
        createEntities,
        updateEntities,
        deleteEntities,
        //   messages,
        //   engineMessages
    }
}


const NType = {
    NULL: 0,
    Channel: 1,
    TestEntity: 2,
}

const ncontext = new Context()
ncontext.register(NType.Channel, defineSchema({}))
ncontext.register(NType.TestEntity, defineSchema({
    x: Binary.Float64,
    y: Binary.Float64
}))

const users = new Map()
const entities = new Map()
const instance = new Instance(ncontext)
const main = new Channel(instance.localState, NType.Channel)


function spawnNewNPC() {
    const entity = { 
        nid: 0, 
        ntype: NType.TestEntity, 
        x: 500, 
        y: 500, 
        age: 0, 
        maxAge: 1 + (Math.random() * 3) 
    }
    main.addEntity(entity)
    entities.set(entity.nid, entity)
}

function removeNPC(entity: IEntity) {
    entities.delete(entity.nid)
    main.removeEntity(entity)
}

for (let i = 0; i < 400; i++) {
    spawnNewNPC()
}

for (let i = 0; i < 200; i++) {
    const user = new User(instance.localState)
    user.id = i + 1
    main.subscribe(user)
    users.set(user.id, user)
}

function simpleConstantMutationScenario(delta: number) {
    // mutation of game state to create work
    entities.forEach(entity => {
        entity.x += delta
        entity.y += delta
    })

}

function lotsOfRespawningScenario(delta: number) {
    entities.forEach(entity => {
        entity.age += delta
        entity.x += delta
        entity.y += delta
        if (entity.age > entity.maxAge) {
            removeNPC(entity)
            spawnNewNPC()
        }
    })
}


function hot(delta: number) {
    //simpleConstantMutationScenario(delta)
    lotsOfRespawningScenario(delta)

    // instance tick logic, subset
    instance.tick++
    instance.cache.createCachesForTick(instance.tick)
    const start = performance.now()
    users.forEach(user => {
        getVisibleState(user, instance)
    })
    const stop = performance.now()
    const firstUser = users.get(1)! as User
    console.log(`hot finished in ${stop - start} ms; ${ instance.localState._entities.size } :: ${ firstUser.currentlyVisible.length }`)
    instance.cache.deleteCachesForTick(instance.tick)
}

setInterval(() => {
    hot(1/20)
}, 50)