# nengi.js - multiplayer network engine <img src="https://timetocode.com/images/nengi-logo-32x32.png" />
Experimental branch for nengi 2! Not stable or documented yet :D

Generally speaking, nengi 2 is conceptually similar to nengi 1, with the following changes:

* written in Typescript
* simplified connection logic (`await client.connect(payload)`)
* deterministic connect/disconnect
* modular, in fact the core of nengi has no external dependencies and is pure game networking logic minus the actual sending of data over the pipe (data is sent by the modules in the Adapters section)
* somehow even less opinionate about engine/programming style, and entirely focused on doing one job (networking) as well as possible. Specifically this means that there is now support for sending Classes, plain objects, and even pure functional programming (as opposed to nengi 1 which required classes with their network protocols statically attached)
* wildly performant (100-400 players, 10,000s of entities)
* all objects are flat now (no more foo.bar.baz, use get/set if you want to nest properties)
* instead of adding objects to an instance, objects are added to a channel (and there can be multiple channels)
* can be used for things more than games (pretty much any websocket application, even serverside services)
* runs in more environments
* writes bytes instead of bits (much faster, trivially more bandwidth -- also still have the option to write bits manually into typed arrays and send them if desired)
* Clients on the server are now called `User`
* `protocol` is now called `schema`
* has `Context` objects that collect all schemas -- it is possible to run multiple nengi instances in one node app now (but why bother? horizontally scale please)

## Adapters
nengi 2 has no websocket/dataview/buffer dependency by default, and you may pick and choose the underlying websocket library+tech depending where you intend to run nengi. The most common configuration is to run nengi.js instances on node.js servers and nengi.js clients in web browsers (the recommended items below).

- RECOMMENDED FOR SERVER: [https://github.com/timetocode/nengi-uws-instance-adapter](https://github.com/timetocode/nengi-uws-instance-adapter) - allows a nengi Instance to listen to sockets in node.js using uws.js and Buffers
- RECOMMENDED FOR CLIENT: [https://github.com/timetocode/nengi-websocket-client-adapter](https://github.com/timetocode/nengi-websocket-client-adapter) - allows a nengi Client to open connections using regular browser websockets and DataViews
- Alternative for server/Electron: [https://github.com/timetocode/nengi-ws-instance-adapter](https://github.com/timetocode/nengi-ws-instance-adapter) - allows a nengi Instance to listen to sockets in node.js using ws and Buffers
- Sevices/Bots: [https://github.com/timetocode/nengi-ws-client-adapter](https://github.com/timetocode/nengi-ws-client-adapter) - allows a nengi Client to run in node.js and connect to servers

If you are attempting to emulate nengi 1.0, use uws.js on the server, and regular browser websockets on the client -- that's all 1.0 had available.

## Make your own Adapter
Want nengi to speak over another protocol? Well you can ask the developer to add it (i might!) or roll your own. Some things that might be interesting are WebRTC, QUIC, misc javascript websocket implementations, and if you're really ambitious a non-javascript client (probably don't do that until the api hits 1.0.0).

- nengi buffers [https://github.com/timetocode/nengi-buffers](https://github.com/timetocode/nengi-buffers) - binary implemenation using node Buffers, usually what's available for a library that runs in node
- nengi dataviews [https://github.com/timetocode/nengi-dataviews](https://github.com/timetocode/nengi-dataviews) - binary implementation using browser DataViews, usually whats available for a library that runs in a browser

## Current API
The api is open to sudden change without any version changing. We will adhere to semver after the formal release (date TBD). If you'd like to use the unsable version of the api it is suggested to npm install specific commits and/or stay active in the nengi discord channel.

### Instance

Minimal instance example:
```js
import { Instance, NetworkEvent, AABB2D, ChannelAABB2D, Channel } from 'nengi'
import { ncontext } from '../common/ncontext'
import { NType } from '../common/NType'
import { uWebSocketsInstanceAdapter } from 'nengi-uws-instance-adapter'
import { BufferWriter } from 'nengi-buffers'

// mocks hitting an external service to authenticate a user
const authenticateUser = async (handshake: any) => {
    return new Promise<any>((resolve, reject) => {
        setTimeout(() => { // as if the api took time to respond
            if (handshake.token === 12345) {
                // pretending that this data came from the db
                resolve({ character: 'neuron', level: 24, hp: 89 })
            } else {
                reject('Connection denied: invalid token.')
            }
        }, 500)
    })
}
// ^ note: want to just accept all connections? resolve(true)

const instance = new Instance(ncontext, BufferWriter)
// uws! node.js
const port = 9001
const uws = new uWebSocketsInstanceAdapter(instance.network, { /* uws config */ })
uws.listen(port, () => { console.log(`uws adapter is listening on ${port}`) })
instance.network.registerNetworkAdapter(uws)
instance.onConnect = authenticateUser

// a plain channel (everyone sees everything in it)
const main = new Channel(instance.localState)
instance.registerChannel(main)

// a spatial channel (users have a view and see positional objects within their view)
const space = new ChannelAABB2D(instance.localState)
instance.registerChannel(space)

const queue = instance.network.queue

const update = () => {
    while (!queue.isEmpty()) {
        const networkEvent = queue.next()

        if (networkEvent.type === NetworkEvent.UserDisconnected) {
            const { user } = networkEvent
            // handle disconnection here...
        }

        if (networkEvent.type === NetworkEvent.UserConnected) {
            const { user } = networkEvent
            // handle connection here... for example:
            main.subscribe(user)
            // @ts-ignore
            user.view = new ViewAABB(0, 0, 2200, 2200)
            // @ts-ignore
            space.subscribe(networkEvent.user, user.view)

            // could be a class, too, the important part is `ntype`
            const playerEntity = { nid: 0, ntype: NType.Entity, x: 50, y: 50 }
            main.addEntity(playerEntity)
            user.queueMessage({ myId: playerEntity.nid, ntype: NType.IdentityMessage })
        }

        if (networkEvent.type === NetworkEvent.Command) {
            const { user, command } = networkEvent.user

            if (command.ntype === NType.Command) {
                const { w, a, s, d, delta } = command
                // do something with WASD
            }
        }
    }
    instance.step()
}

setInterval(() => {
    update()
}, 50)

```

### Client
Minimal client example

```js
import { Client, Interpolator } from 'nengi'
import { ncontext } from '../common/ncontext'
import { NType } from '../common/NType'
import { WebSocketClientAdapter } from 'nengi-websocket-client-adapter'

window.addEventListener('load', async () => {
    console.log('window loaded!')

    const serverTickRate = 20 // 20 ticks per second
    const client = new Client(ncontext, WebSocketClientAdapter, serverTickRate)
    const interpolator = new Interpolator(client)
    try {
        const res = await client.connect('ws://localhost:9001', { token: 12345 })
    } catch (err) {
        console.log('connection error', err)
    }

    const tick = (delta: number) => {
        const istate = interpolator.getInterpolatedState(100 /* interp delay */)

        while (client.network.messages.length > 0) {
            const message = client.network.messages.pop()
            // TODO handle message
        }

    istate.forEach(snapshot => {
        snapshot.createEntities.forEach((entity: any) => {
            // TODO create new entity on the client
        })

        snapshot.updateEntities.forEach((diff: any) => {
            // TODO update existing entity
        })

        snapshot.deleteEntities.forEach((nid: number) => {
            // TODO remove existing entity
        })
    })

        // send command to server (hypothetical)
        const { w, a, s, d } = inputState
        client.addCommand({ ntype: NType.Command, w, a, s, d, delta })
        client.flush()
    }

    // a standard rAF loop
    let prev = performance.now()
    const loop = () => {
        window.requestAnimationFrame(loop)
        const now = performance.now()
        const delta = (now - prev) / 1000
        prev = now
        // probably missing "if (connected)..."
        tick(delta)
    }

    // start the loop
    loop()
})
```

### What are NType and ncontext?
They're just the definitions of the networked objects, for example:

```js
// NType is just a number 1-255
enum NType {
    Command = 1,
    Entity,
    ATestMessage,
    IdentityMessage,
    ShipType,
    Area,
    Position,
    WhateverEtc
}
export { NType }
```

```js
// ncontext is all of the schemas, like nengiConfig.js from nengi 1.x
import { Context } from 'nengi'
import { NType } from './NType'
import { testMessageSchema } from './schemas/testMessageSchema'
import { entitySchema } from './schemas/entitySchema'
import { testCommandSchema } from './schemas/testCommandSchema'
import { identityMessageSchema } from './schemas/identityMessageSchema'
import { shipTypeSchema} from './schemas/shipTypeSchema'
import { areaSchema } from './schemas/areaSchema'
import { positionSchema } from './schemas/positionSchema'

const ncontext = new Context()
ncontext.register(NType.TestMessage, testMessageSchema)
ncontext.register(NType.Entity, entitySchema)
ncontext.register(NType.Command, testCommandSchema)
ncontext.register(NType.IdentityMessage, identityMessageSchema)
ncontext.register(NType.ShipType, shipTypeSchema)
ncontext.register(NType.Area, areaSchema)
ncontext.register(NType.Position, positionSchema)

export { ncontext }
```

ncontext and NType are used by both the client and the instance

Actually schema definitions are similar to nengi 1.0 syntax, just with the addition of `defineSchema`

```js
import { Binary, defineSchema, Schema } from 'nengi'

const areaSchema: Schema = defineSchema({
    hexColor: Binary.Float64,
    pid: Binary.UInt32,
    width: Binary.UInt16,
    height: Binary.UInt16
})

export { areaSchema }
```

Please note that all schemas have an ntype and a nid by default, and you do not need to explicitly define them.

## Anticipated changes
What exactly is unstable about the api? Well on a general conceptually level nengi is going to stay more or less the same, however there are a few big items in flux at the moment.


### Channels vs Parenting
The first is whether or not channels will be used simply to send data to clients, without the clients being aware that the channels exist, or whether data on the clientside will be clearly associated from a channel. The advantage of knowing the channel can be that it can make clientside code very simple. Imagine opening a treasure chest or container and having a dozen items in it as entities. If the client is not aware of channels, then it simply receives 12 entities for some unknown reason (we might need to send messages to explain to the client what these entities are, or we might need to attach metadata to the entities such as `containerId`). Meanwhile if the entities come through within a specific channel such as `container 62` we might be able to make some normally quite tedious features with a trivial amount of code. This can also currently be accomplished by parenting the item entities to a chest entity without making any changes to the current api -- which begs the question.. do we need a channel? Or can we recreate channels via scene-graph style parenting via the current api. This whole thing needs solved before the api is stable.

### Binary types and flat objects
The current binary types are essentially strings, booleans, numbers (signed & unsigned 8 bit, 16 bit, 32 bit, 64 bit) and arrays of the aforementioned. I'm 99% certain that nengi itself should not support deeply nested objects, and that the game developers should use get/set, parenting, or components to recreate nested schemas within their own code. The question remains however whether nengi should offer types like Vector3, Matrices, and Quaterions out of the box -- and given the modular nature of nengi2, probably the ability to define custom types as well.

### Variable tick rates per channel
TBD? Not difficult to code on the server, but very complex for the clientside interpolator(s). The other complex item is a dynamic tick rate (meaning that in addition to channels having different tick rates, their tick rate can also change.)


### Modular TODOs
While the current prototype is way modular compared to before, there are still a few areas that are hardcoded to use a Buffer and thus would run in node only. These aren't significant logistical concerns, they just haven't been finished yet.

### Support for many more objects or binary types
Currently n2 is hardcoded to support up to 256 schemas (aka ntypes) and upto 65536 simultaneous entities. This is sane and good. But some use cases have been suggested where there are a huge number of essentially dormant objects -- they might want a UInt32 worth of entities or types. Should we support this? Often people write systems which identify objects via uuids, which frankly makes no sense for optimized netcode and should only exist as metadata attached to objects not the actual routine network identfier. Perhaps nengi, via "engine messages" that are concealed from the the public api, can communicate between server and client what the binary type is for `nid` an `ntype` based on how many objects are added to the instance. Or maybe this makes the api horrendous. TBD.