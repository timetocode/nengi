import { IdPool } from './IdPool'

test('throws when out of ids', () => {
    const idPool = new IdPool(5)

    idPool.nextId() // 1
    idPool.nextId() // 2
    idPool.nextId() // 3
    idPool.nextId() // 4
    idPool.nextId() // 5

    expect(() => {
        idPool.nextId()
    }).toThrow()
})

test('recycles ids', () => {
    // only two ids (1, 2)
    const idPool = new IdPool(2)

    idPool.nextId() // 1
    idPool.nextId() // 2

    idPool.returnId(1)
    idPool.releaseDeferredIds()
    expect(idPool.nextId()).toEqual(1)
})

test('does not recycle returned ids before reaching the end of the id range after release', () => {
    const idPool = new IdPool(5)

    expect(idPool.nextId()).toEqual(1)
    expect(idPool.nextId()).toEqual(2)

    idPool.returnId(1)
    idPool.releaseDeferredIds()

    expect(idPool.nextId()).toEqual(3)
    expect(idPool.nextId()).toEqual(4)
    expect(idPool.nextId()).toEqual(5)
    expect(idPool.nextId()).toEqual(1)
})

test('does not recycle returned ids until deferred ids are released', () => {
    const idPool = new IdPool(2)

    expect(idPool.nextId()).toEqual(1)
    expect(idPool.nextId()).toEqual(2)

    idPool.returnId(1)

    expect(() => {
        idPool.nextId()
    }).toThrow()

    idPool.releaseDeferredIds()

    expect(idPool.nextId()).toEqual(1)
})

test('recycles ids, more complex', () => {
    const idPool = new IdPool(5)

    idPool.nextId() // 1
    idPool.nextId() // 2
    idPool.nextId() // 3
    idPool.nextId() // 4
    idPool.nextId() // 5

    idPool.returnId(3)
    idPool.releaseDeferredIds()

    expect(idPool.nextId()).toEqual(3)

    expect(() => {
        idPool.nextId()
    }).toThrow()

    idPool.returnId(1)
    idPool.releaseDeferredIds()

    expect(idPool.nextId()).toEqual(1)
})
