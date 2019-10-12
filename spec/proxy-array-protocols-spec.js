
require = require("esm")(module/*, options*/)
var proxify = require('../core/protocol/proxify').default
var deproxify = require('../core/protocol/deproxify').default
var copyProxy = require('../core/protocol/copyProxy').default
const Protocol = require('../core/protocol/Protocol').default
var nengi = require('..').default

const config = {
    ID_BINARY_TYPE: nengi.UInt16,
    TYPE_BINARY_TYPE: nengi.UInt8,
    ID_PROPERTY_NAME: 'nid',
    TYPE_PROPERTY_NAME: 'ntype',
}

describe('nest proxy', function () {
    /*
    * Would I really make a game map like this? no. I would make a few arrays
    * of bytes holding tile data with far less nesting. So this code is really 
    * just for creating objects to test nesting
    * */

    class Tile {
        constructor(a, b, c) {
            this.a = a
            this.b = b
            this.c = c
        }
    }
    Tile.prototype.protocol = new Protocol({
        a: nengi.UInt8,
        b: nengi.UInt8,
        c: nengi.UInt8
    }, config)

    class Layer {
        constructor(name, tiles) {
            this.name = name
            this.tiles = tiles
        }
    }
    Layer.prototype.protocol = new Protocol({
        name: nengi.String,
        tiles: { type: Tile, indexType: nengi.UInt32 }
    }, config)

    class World {
        constructor(name, width, height, layers) {
            this.name = name
            this.width = width
            this.height = height
            this.layers = layers
        }
    }
    World.prototype.protocol = new Protocol({
        name: nengi.String,
        width: nengi.UInt16,
        height: nengi.UInt16,
        layers: { type: Layer, indexType: nengi.UInt8 }
    }, config)

    const world = new World(
        'WorldName',
        256, // made up data.. really this map is 3 layers each with 3 tiles
        256,
        [
            new Layer('layer0', [
                new Tile(1, 2, 3),
                new Tile(4, 5, 6),
                new Tile(7, 8, 9),
            ]),
            new Layer('layer1', [
                new Tile(11, 12, 13),
                new Tile(14, 15, 16),
                new Tile(17, 18, 19),
            ]),
            new Layer('layer2', [
                new Tile(21, 22, 23),
                new Tile(24, 25, 26),
                new Tile(27, 28, 29),
            ]),
        ]
    )

    it('first layer', function () {
        const proxy = proxify(world, world.protocol)
        expect(proxy.name).toEqual(world.name)
        expect(proxy.width).toEqual(world.width)
        expect(proxy.height).toEqual(world.height)

        const worldClone = deproxify(proxy, world.protocol)

        // equivalent but distinct
        expect(worldClone.name).toEqual(world.name)
        expect(worldClone.width).toEqual(world.width)
        expect(worldClone.height).toEqual(world.height)
        expect(worldClone).not.toBe(world)
    })

    it('second layer', function () {
        const proxy = proxify(world, world.protocol)
        const worldClone = deproxify(proxy, world.protocol)

        // equivalent but distinct
        expect(worldClone.layers[0]).not.toBe(world.layers[0])
        expect(worldClone.layers[0].name).toEqual(world.layers[0].name)
    })

    it('third layer', function () {
        const proxy = proxify(world, world.protocol)
        const worldClone = deproxify(proxy, world.protocol)

        // equivalent but distinct
        expect(worldClone.layers[0].tiles[0]).not.toBe(world.layers[0].tiles[0])
        expect(worldClone.layers[0].tiles[0].a).toEqual(world.layers[0].tiles[0].a)
    })
})