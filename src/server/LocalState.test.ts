import { LocalState } from './LocalState'

describe('LocalState', () => {
    it('assigns a nid of 1 to the first freshly added entity', () => {
        const localState = new LocalState()
        const entity = { nid: 0, ntype: 1 }
        localState.registerEntity(entity, 1)
        expect(entity.nid).toEqual(1)
    })

    it('correctly associates an entity with a source', () => {
        const source = 123 // this is how channels work, they are just a source
        const localState = new LocalState()
        const entity = { nid: 0, ntype: 1 }
        localState.registerEntity(entity, source)
        expect(entity.nid).toEqual(1)
        expect(localState.sources.get(1)).toEqual(new Set([123]))
        expect(localState.sources.get(1)).not.toEqual(new Set([321]))
    })

    it('correctly associates parents and children', () => {
        const source = 123 // this is how channels work, they are just a source
        const localState = new LocalState()

        const parent = { nid: 0, ntype: 1 }
        const child = { nid: 0, ntype: 2 }

        localState.registerEntity(parent, source)
        expect(parent.nid).toEqual(1)
    
        localState.addChild(parent.nid, child)
        expect(child.nid).toEqual(2) // will be 2, now the second networked object

        expect(localState.sources.get(1)).toEqual(new Set([123]))

        expect(localState.children.get(1)).toEqual(new Set([2])) // entity 1 is now a parent, and it contains entity 2 in its Set

        //expect(localState.channelSources.get(2)).toEqual(new Set([]))

        localState.removeChild(parent.nid, child) // remove the child

        expect(localState.children.get(1)).toEqual(new Set([])) // the set is empty now
    })



})