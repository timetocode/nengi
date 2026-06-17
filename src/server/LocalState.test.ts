import { LocalState } from './LocalState'
import { Binary } from '../common/binary/Binary'

describe('LocalState', () => {
    it('assigns a nid of 1 to the first freshly added entity', () => {
        const localState = new LocalState()
        const entity = { nid: 0, ntype: 1 }
        localState.registerEntity(entity, 1)
        expect(entity.nid).toEqual(1)
    })

    it('correctly associates an entity with an owner', () => {
        const owner = 123 // root entities are owned by channels
        const localState = new LocalState()
        const entity = { nid: 0, ntype: 1 }
        localState.registerEntity(entity, owner)
        expect(entity.nid).toEqual(1)
        expect(localState.ownerByNid.get(1)).toBe(123)
        expect(localState.ownerByNid.get(1)).not.toBe(321)
    })

    it('correctly associates parents and children', () => {
        const source = 123 // this is how channels work, they are just a source
        const localState = new LocalState()

        const parent = { nid: 0, ntype: 1 }
        const child = { nid: 0, ntype: 2 }

        localState.registerEntity(parent, source)
        expect(parent.nid).toEqual(1)
    
        localState.addChild(parent, child)
        expect(child.nid).toEqual(2) // will be 2, now the second networked object

        expect(localState.ownerByNid.get(1)).toBe(123)

        expect(localState.children.get(1)).toEqual(new Set([2])) // entity 1 is now a parent, and it contains entity 2 in its Set
        expect(localState.getParentNid(child.nid)).toBe(parent.nid)
        expect(localState.getRootNid(child.nid)).toBe(parent.nid)

        //expect(localState.channelSources.get(2)).toEqual(new Set([]))

        localState.removeChild(parent, child) // remove the child

        expect(localState.children.get(1)).toEqual(new Set([])) // the set is empty now
        expect(localState.getParentNid(child.nid)).toBe(0)
        expect(localState.getRootNid(child.nid)).toBe(0)
    })

    it('requires a parent to already be networked before attaching a child', () => {
        const localState = new LocalState()
        const parent = { nid: 0, ntype: 1 }
        const child = { nid: 0, ntype: 2 }

        expect(() => localState.addChild(parent, child)).toThrow('Cannot attach a child')
        expect(child.nid).toBe(0)
    })

    it('allows each entity to have only one network source', () => {
        const localState = new LocalState()
        const parent = { nid: 0, ntype: 1 }
        const firstChild = { nid: 0, ntype: 2 }
        const secondParent = { nid: 0, ntype: 1 }

        localState.registerEntity(parent, 123)
        localState.registerEntity(secondParent, 456)
        localState.addChild(parent, firstChild)

        expect(() => localState.addChild(secondParent, firstChild)).toThrow('already networked by another source')
        expect(() => localState.registerEntity(firstChild, 789)).toThrow('already networked by another source')
    })

    it('treats attaching the same child to the same parent as idempotent', () => {
        const localState = new LocalState()
        const parent = { nid: 0, ntype: 1 }
        const child = { nid: 0, ntype: 2 }

        localState.registerEntity(parent, 123)
        localState.addChild(parent, child)
        localState.addChild(parent, child)

        expect(localState.children.get(parent.nid)).toEqual(new Set([child.nid]))
        expect(localState.ownerByNid.get(child.nid)).toBe(parent.nid)
    })

    it('treats removing a detached child from a registered parent as idempotent', () => {
        const localState = new LocalState()
        const parent = { nid: 0, ntype: 1 }
        const child = { nid: 0, ntype: 2 }

        localState.registerEntity(parent, 123)

        expect(() => localState.removeChild(parent, child)).not.toThrow()
        expect(child.nid).toBe(0)
    })

    it('rejects unregistering an entity through the wrong owner', () => {
        const localState = new LocalState()
        const entity = { nid: 0, ntype: 1 }

        localState.registerEntity(entity, 123)

        expect(() => localState.unregisterEntity(entity, 456)).toThrow('owned by 123, not 456')
        expect(entity.nid).toBe(1)
        expect(localState.ownerByNid.get(entity.nid)).toBe(123)
    })

    it('unregisters descendants when a parent is unregistered', () => {
        const localState = new LocalState()
        const parent = { nid: 0, ntype: 1 }
        const child = { nid: 0, ntype: 2 }
        const grandchild = { nid: 0, ntype: 2 }

        localState.registerEntity(parent, 123)
        localState.addChild(parent, child)
        localState.addChild(child, grandchild)
        const parentNid = parent.nid
        const childNid = child.nid
        const grandchildNid = grandchild.nid

        localState.unregisterEntity(parent, 123)

        expect(parent.nid).toBe(0)
        expect(child.nid).toBe(0)
        expect(grandchild.nid).toBe(0)
        expect(localState.ownerByNid.has(parentNid)).toBe(false)
        expect(localState.ownerByNid.has(childNid)).toBe(false)
        expect(localState.ownerByNid.has(grandchildNid)).toBe(false)
        expect(localState.children.has(parentNid)).toBe(false)
        expect(localState.children.has(childNid)).toBe(false)
    })

    it('collects entity trees parent-first and deletes child-first', () => {
        const localState = new LocalState()
        const parent = { nid: 0, ntype: 1 }
        const firstChild = { nid: 0, ntype: 2 }
        const secondChild = { nid: 0, ntype: 2 }
        const grandchild = { nid: 0, ntype: 2 }

        localState.registerEntity(parent, 123)
        localState.addChild(parent, firstChild)
        localState.addChild(parent, secondChild)
        localState.addChild(firstChild, grandchild)

        expect(localState.getParentNid(firstChild.nid)).toBe(parent.nid)
        expect(localState.getParentNid(grandchild.nid)).toBe(firstChild.nid)
        expect(localState.getRootNid(grandchild.nid)).toBe(parent.nid)
        expect(localState.collectEntityTree(parent.nid, [])).toEqual([
            parent.nid,
            firstChild.nid,
            grandchild.nid,
            secondChild.nid
        ])
        expect(localState.collectEntityTreeDeletes(parent.nid, [])).toEqual([
            grandchild.nid,
            firstChild.nid,
            secondChild.nid,
            parent.nid
        ])
    })

    it('invalidates flattened tree caches when children are added and removed', () => {
        const localState = new LocalState()
        const parent = { nid: 0, ntype: 1 }
        const firstChild = { nid: 0, ntype: 2 }
        const secondChild = { nid: 0, ntype: 2 }

        localState.registerEntity(parent, 123)
        localState.addChild(parent, firstChild)

        expect(localState.collectEntityTree(parent.nid, [])).toEqual([parent.nid, firstChild.nid])

        localState.addChild(parent, secondChild)
        expect(localState.collectEntityTree(parent.nid, [])).toEqual([parent.nid, firstChild.nid, secondChild.nid])

        localState.removeChild(parent, firstChild)
        expect(localState.collectEntityTree(parent.nid, [])).toEqual([parent.nid, secondChild.nid])
    })



    it('stays UInt8 by recycling released ids after the UInt8 range has wrapped', () => {
        const localState = new LocalState()
        const entities = []

        for (let i = 0; i < 255; i++) {
            const entity = { nid: 0, ntype: 1 }
            localState.registerEntity(entity, 1)
            entities.push(entity)
        }

        expect(localState.nidType).toBe(Binary.UInt8)

        for (let i = 100; i < 155; i++) {
            localState.unregisterEntity(entities[i], 1)
        }
        localState.releaseDeferredIds()

        const recycled = []
        for (let i = 0; i < 55; i++) {
            const entity = { nid: 0, ntype: 1 }
            localState.registerEntity(entity, 1)
            recycled.push(entity)
        }

        expect(recycled[0].nid).toBe(101)
        expect(recycled[54].nid).toBe(155)
        expect(localState.nidType).toBe(Binary.UInt8)
    })

    it('widens to UInt16 when the live entity set exceeds UInt8', () => {
        const localState = new LocalState()

        for (let i = 0; i < 255; i++) {
            localState.registerEntity({ nid: 0, ntype: 1 }, 1)
        }

        const widened = { nid: 0, ntype: 1 }
        localState.registerEntity(widened, 1)

        expect(widened.nid).toBe(256)
        expect(localState.nidType).toBe(Binary.UInt16)
    })

    it('widens to UInt16 when returned UInt8 ids are still deferred in the same frame', () => {
        const localState = new LocalState()
        const entities = []

        for (let i = 0; i < 255; i++) {
            const entity = { nid: 0, ntype: 1 }
            localState.registerEntity(entity, 1)
            entities.push(entity)
        }

        localState.unregisterEntity(entities[100], 1)

        const widened = { nid: 0, ntype: 1 }
        localState.registerEntity(widened, 1)

        expect(widened.nid).toBe(256)
        expect(localState.nidType).toBe(Binary.UInt16)

        localState.releaseDeferredIds()

        const next = { nid: 0, ntype: 1 }
        localState.registerEntity(next, 1)

        expect(next.nid).toBe(257)
        expect(localState.nidType).toBe(Binary.UInt16)
    })

    it('widens when the pool is full even if the allocator cursor has wrapped', () => {
        const localState = new LocalState()

        for (let i = 0; i < 255; i++) {
            localState.registerEntity({ nid: 0, ntype: 1 }, 1)
        }

        localState.nidPool.current = 4

        const widened = { nid: 0, ntype: 1 }
        localState.registerEntity(widened, 1)

        expect(widened.nid).toBe(256)
        expect(localState.nidType).toBe(Binary.UInt16)
    })
})
