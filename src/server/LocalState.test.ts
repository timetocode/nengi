import { LocalState } from './LocalState'

describe('LocalState', () => {

    // Test for flat game structures
    it('correctly adds and removes flat entities', () => {
        const localState = new LocalState()
        const entity1 = { nid: 0, ntype: 1 }
        const entity2 = { nid: 0, ntype: 2 }

        localState.addEntity(entity1)
        localState.addEntity(entity2)

        expect(localState.getByNid(1).ntype).toBe(1)
        expect(localState.getByNid(2).ntype).toBe(2)

        localState.removeEntity(entity1)

        expect(localState.getByNid(1)).toBeUndefined()
        expect(localState.getByNid(2).ntype).toBe(2)
    })

    // Test for small scene graph structures
    it('adds and removes entities in a scene graph', () => {
        const localState = new LocalState()
        const parent = { nid: 0, ntype: 1 }
        const child1 = { nid: 0, ntype: 2 }
        const child2 = { nid: 0, ntype: 3 }

        localState.addEntity(parent)
        localState.addChild(child1, parent)
        localState.addChild(child2, parent)

        expect(localState.children.get(parent.nid)!.size).toBe(2)

        localState.removeEntity(child1)

        expect(localState.children.get(parent.nid)!.size).toBe(1)
        expect(localState.children.get(parent.nid)!.has(child2.nid)).toBe(true)
    })

    // Test for ECS structures
    it('adds and removes entities in an ECS', () => {
        const localState = new LocalState()
        const entity = { nid: 0, ntype: 1 }
        const component1 = { nid: 0, ntype: 2 }
        const component2 = { nid: 0, ntype: 3 }

        localState.addEntity(entity)
        localState.addChild(component1, entity)
        localState.addChild(component2, entity)

        expect(localState.children.get(entity.nid)!.size).toBe(2)

        localState.removeEntity(component1)

        expect(localState.children.get(entity.nid)!.size).toBe(1)
        expect(localState.children.get(entity.nid)!.has(component2.nid)).toBe(true)
    })

    // Test for recursive removal of orphaned children
    it('recursively removes orphaned children', () => {
        const localState = new LocalState()
        const grandParent = { nid: 0, ntype: 1 }
        const parent = { nid: 0, ntype: 2 }
        const child = { nid: 0, ntype: 3 }

        localState.addEntity(grandParent)
        localState.addChild(parent, grandParent)
        localState.addChild(child, parent)

        expect(localState.children.get(grandParent.nid)!.has(parent.nid)).toBe(true)
        expect(localState.children.get(parent.nid)!.has(child.nid)).toBe(true)

        localState.removeEntity(grandParent)

        expect(localState.getByNid(grandParent.nid)).toBeUndefined()
        expect(localState.getByNid(parent.nid)).toBeUndefined()
        expect(localState.getByNid(child.nid)).toBeUndefined()
    })

    // Test for entities with multiple parents
    it('keeps child with multiple parents after one parent is removed', () => {
        const localState = new LocalState()
        const parent1 = { nid: 0, ntype: 1 }
        const parent2 = { nid: 0, ntype: 2 }
        const child = { nid: 0, ntype: 3 }

        localState.addEntity(parent1)
        localState.addEntity(parent2)
        localState.addChild(child, parent1)
        localState.addChild(child, parent2)

        expect(localState.children.get(parent1.nid)!.has(child.nid)).toBe(true)
        expect(localState.children.get(parent2.nid)!.has(child.nid)).toBe(true)

        localState.removeEntity(parent1)

        expect(localState.getByNid(parent1.nid)).toBeUndefined()
        expect(localState.getByNid(parent2.nid).ntype).toBe(2)
        expect(localState.getByNid(child.nid).ntype).toBe(3)
    })
})
