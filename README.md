# nengi.js - multiplayer network engine <img src="https://timetocode.com/images/nengi-logo-32x32.png" />
Hello friend. Nengi.js is a networking library/engine for node.js and HTML5.

Nengi straddles two types of performance: volume and responsiveness.

 With respect to volume, it is possible to make a nengi game that can support 100+ concurrent players or 50,000+ entities on a 20 tick server.
 
 Regarding responsiveness, the advanced api consists of tools that can eliminate input delay, setup lag compensated collisions, and smooth away lag. This boils down to a game with controls so responsive that it feels like single player.

Have your players saying:
>"HOW IS THIS A BROWSER GAME?!"

Join us on [nengi's Discord server](https://discord.gg/7kAa7NJ) or help support development on [timetocode's Patreon](https://www.patreon.com/timetocode)

## Features
* Authoritative Server Model (anti-cheat)
* Binary compression
* Optimized game state snapshots
* Networking culling
* An easy to use api consisting of
    * Entities - persistent objects that stay synced in real time
    * Messages - events and other instantaneous occurrences
    * Commands - input from game clients
    * Channels - compose the above into more advanced features
* Interpolation
* Compatible with PIXI.js, Babylon.js, Three.js, and much more
* Clientside prediction api
    * --> move instantly on the client
    * --> nengi will provide reconciliation data if needed
* Lag compensated shots / collisions
    * --> a player fires a shot
    * --> nengi can rewind the game state to the point in time that the shot occured given the player's latency

Tutorials and demo games are in the works.
* [nengi-2d-basic](https://github.com/timetocode/nengi-2d-basic)  - a simple 2d shooter without prediction/compensation

## Usage
The [API documentation](https://timetocode.com/nengi) is the place to go for implementation details. But as an appetizer here is a tour of the the functionality associated with one of nengi's core features, the nengi.Entity

### the nengi.Entity stack
```js
// this is your own game object, it can have any properties or methods
class PlayerCharacter {
    constructor(x, y) {
        this.x = x
        this.y = y
        this.likesKittens = true
    }
    someLogic() {
        //etc
    }
}

// and this tells nengi what exactly to network about it
PlayerCharacter.protocol = {
    x: { type: nengi.Float32, interp: true },
    y: { type: nengi.Float32, interp: true }
}
```

The entity can then go on to be used in a nengi.Instance (the node.js game server)

```js
const entity = new PlayerCharacter(50, 50)
instance.addEntity(entity)
```

Any changes that occur to the entity's networked properties (in this case x & y) will automatically be detected and synchronized. The nengi.Client (the HTML5 game client) will receive the following data which encompasses any state change on any entity:

```js
const network = client.readNetwork()
network.entities.forEach(snapshot => {
    snapshot.createEntities.forEach(entity => {
        // entity { nid: 65534, ntype: 0, x: 50, y: 50, protocol: { name: 'PlayerCharacter', ... }} 
    })

    snapshot.updateEntities.forEach(update => {
        // update { nid: 65534, prop: 'x', value: 63, path: ['x'] }
    })

    snapshot.deleteEntities.forEach(nid => {
        // nid 65534
    })
})
```
This is everything the game client needs to keep any number of entities in sync: create, update, and delete. The data that traveled over the network was already optimized and highly compressed. The game state that comes out of client.readNetwork() is already smoothly interpolated and compatible with different frame rates (30, 60, 144, 250 etc).

This automatic synchornization of state on entities is the soul of nengi. It strikes a balance between configurability, performance, and ease of development. It also stays out of your game code. For things that are not easily represented as an entity, we have the nengi.Message, which can be used to manually network just about anything else.

The above is sufficient to network a vast variety of games where the game client sends commands to the game server and then waits on a reply from the server before the seeing the results of its commands. I refer to these as "non-predicted" games and every aspiring multiplayer programmer should make at least one before moving deeper with nengi.

That's the end of the basic path for a nengi entity, but the documentation covers the more advanced life of an entity. Summarized briefly, entities are culled, can be used for predictive movement on the game client, and have their state rewinded for advanced lag compensation.









