import { Binary } from '../common/binary/Binary'
import { defineSchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client } from './Client'
import { Interpolator } from './Interpolator'
import { Snapshot } from './Snapshot'

function waitFor(ms: number) : Promise<boolean>{
    return new Promise((resolve, reject) => {
        setTimeout(() => { resolve(true) }, ms)
    })
}

test('', async () => {
    const aSchema = defineSchema({
        x: Binary.Float64,
        y: Binary.Float64,
        name: Binary.String
    })

    const ncontext = new Context()
    ncontext.register(1, aSchema)

    class MockAdapter {
        constructor(network: any) {

        }
    }

    const client = new Client(ncontext, MockAdapter)

    // snapshot that creates 2 entities
    const a: Snapshot = {
        messages: [],
        createEntities: [{
            nid: 1,
            ntype: 1,
            x: 50,
            y: 50,
            name: 'Test Entity 1'
        },
        {
            nid: 2,
            ntype: 1,
            x: 100,
            y: 100,
            name: 'Test Entity 2'
        }],
        updateEntities: [],
        deleteEntities: []
    }


    client.network.snapshots.push(a)

    // snapshot that has the previously created enities moving
    const b: Snapshot = {
        messages: [],
        createEntities: [],
        updateEntities: [
            { nid: 1, prop: 'x', value: 70 },
            { nid: 1, prop: 'y', value: 70 },
            { nid: 2, prop: 'x', value: 120 },
            { nid: 2, prop: 'y', value: 120 },

        ],
        deleteEntities: []
    }

    client.network.snapshots.push(b)

    const interpolator = new Interpolator(client)

    await waitFor(300)

    const iState = interpolator.getInterpolatedState(100)
    console.log('yolo', iState)




})