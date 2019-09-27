const ID_PROPERTY_NAME = 'nid'

const createClient = () => {
    return {
        cache: {},
        cacheArr: [],
        spaces: [],
        channels: [],
    }
}

const mockEntityQuery = (ids) => {
    return {
        entities: ids.map(id => { return { nid: id } })
    }
}

const createOrUpdate = (id, cache, cacheArr, tick, create, update) => {
    if (!cache[id]) {
        // not previously visible; create
        create.push(id)
        cache[id] = tick
        cacheArr.push(id)
    } else {
        // previously visible; update
        // but only if we haven't already seen it this tick
        // (multiple visibilty sources)
        if (cache[id] !== tick) {
            cache[id] = tick
            update.push(id)
        }
    }
}

const addSpace = (tick, space, cache, cacheArr, create, update) => {
    console.log('addSpace invoked')
    for (let i = 0; i < space.entities.length; i++) {
        const entity = space.entities[i]
        console.log('inspecting...', entity)
        const id = entity[ID_PROPERTY_NAME]
        createOrUpdate(id, cache, cacheArr, tick, create, update)
    }
}

const checkVisibility = (client, tick) => {
    const cr = []
    const up = []
    const de = []
    const cache = client.cache
    const cacheArr = client.cacheArr
    console.log('client', client)

    client.spaces.forEach(space => {
        addSpace(tick, space, cache, cacheArr, cr, up)
    })
    client.channels.forEach(channel => {
        addSpace(tick, channel, cache, cacheArr, cr, up)
    })

    // objects that were previously visible
    for (let i = cacheArr.length - 1; i > -1; i--) {
        const id = cacheArr[i]
        // but are not visible this frame; delete
        if (cache[id] !== tick) {
            de.push(id)
            cache[id] = 0
            cacheArr.splice(i, 1)
        }
    }

    return { cr, up, de }
}

describe('experimental', () => {
    it('channel basics', () => {
        const client = createClient()
        client.spaces.push(mockEntityQuery([1, 2, 3]))
        client.channels.push(mockEntityQuery([2, 3, 4, 5]))
        client.channels.push(mockEntityQuery([4, 5, 6]))
        const vis = checkVisibility(client, 1)
        console.log(vis)
        client.spaces[0].entities.splice(1, 1)
        client.channels.push(mockEntityQuery([3,4,5]))
        const vis2 = checkVisibility(client, 2)
        console.log(vis2)
    })

    it('channel basics2', function () {

    })
})