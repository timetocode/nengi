import { WebSocketServer } from '@clusterws/cws'
import EDictionary from '../../external/EDictionary'
import Historian from './Historian'
import IdPool from './IdPool'
import proxify from '../protocol/proxify'
import compare from '../protocol/compare'
import copyProxy from '../protocol/copyProxy'
import Binary from '../binary/Binary'
import BinaryType from '../binary/BinaryType'
import formatUpdates from '../snapshot/entityUpdate/formatUpdates'
import chooseOptimization from '../snapshot/entityUpdate/chooseOptimization'
import ProtocolMap from '../protocol/ProtocolMap'
import Client from './Client'
import createSnapshotBuffer from '../snapshot/writer/createSnapshotBuffer'
import readCommandBuffer from '../snapshot/reader/readCommandBuffer'
import createConnectionResponseBuffer from '../snapshot/writer/createConnectionResponseBuffer'
import createTransferClientBuffer from '../snapshot/writer/createTransferClientBuffer'
import createTransferRequestBuffer from '../snapshot/writer/createTransferRequestBuffer'
import createTransferResponseBuffer from '../snapshot/writer/createTransferResponseBuffer'
import createHandshakeBuffer from '../snapshot/writer/createHandshakeBuffer'

import consoleLogLogo from '../common/consoleLogLogo'
import metaConfig from '../common/metaConfig'
import NoInterpsMessage from '../common/NoInterpsMessage'
import Sleep from './Sleep'

import BasicSpace from './BasicSpace'
import { EventEmitter } from 'eventemitter3'
import Channel from './Channel'

//const Components = require('./Components')
import defaults from '../defaults'

let protocols = null

class Instance extends EventEmitter {
    constructor(config, webConfig) {
        super()
        /* defaults */
        if (!config) {
            throw new Error('Instance requries a nengiConfig')
        } else {
            for (let prop in defaults) {
                if (typeof (config[prop]) === 'undefined') {
                    config[prop] = defaults[prop]
                }
            }
        }

        if (!webConfig) {
            throw new Error('Instance requries a webConfig')
        }

        if (!protocols) {
            protocols = new ProtocolMap(config, metaConfig)
        }
        this.config = config
        this.transferPassword = webConfig.transferPassword
        this.protocols = protocols
        this.sleepManager = new Sleep()
        this.tick = 0

        this.clientId = 0
        this.entityId = 0
        this.eventId = 0
        this.channelId = 70000

        this.entityIdPool = new IdPool(config.ID_BINARY_TYPE)
        this.pendingClients = new Map()
        this._entities = new EDictionary(config.ID_PROPERTY_NAME)
        this.clients = new EDictionary()
        this.entities = new EDictionary(config.ID_PROPERTY_NAME)
        this.channels = new EDictionary()
        this.channelCount = 0

        this.sources = new Map()

        this.localEvents = []
        this.proxyCache = {}

        //this.components = new Components(this)

        this.historian = new Historian(config.UPDATE_RATE, config.HISTORIAN_TICKS, config.ID_PROPERTY_NAME, config.DIMENSIONALITY)
        // if no history
        this.basicSpace = new BasicSpace(config.ID_PROPERTY_NAME, config.DIMENSIONALITY)

        this.commands = []

        this.transferCallback = null
        this.connectCallback = null
        this.disconnectCallback = null

        this.httpServer = null
        this.wsServer = null

        this.noInterps = []
        this.transfers = {}
        this.createEntities = []
        this.deleteEntities = []

        this.parents = new Map()

        this.debugCount = 0

        if (!config.HIDE_LOGO) {
            consoleLogLogo()
        }

        if (typeof webConfig.port !== 'undefined') {
            this.wsServer = new WebSocketServer({ port: webConfig.port }, () => {
                //console.log(this.wsServer)
            })
        } else if (typeof webConfig.httpServer !== 'undefined') {
            this.wsServer = new WebSocketServer({ server: webConfig.httpServer })
        } else if (typeof webConfig.mock !== 'undefined') {
            // using a connectionless mock mode, see spec folder for interface
            this.wsServer = webConfig.mock
        } else {
            throw new Error('Instance must be passed a config that contains a port or an http server.')
        }

        this.wsServer.on('connection', (ws, req) => {
            var client = this.connect(ws)
            ws.on('message', message => {
                this.onMessage(message, client)
            })

            ws.on('close', (event) => {
                this.disconnect(client, event)
            })
        })

        this.wsServer.on('error', err => {
            console.error(err)
        });
    }

    noInterp(id) {
        this.noInterps.push(id)
    }

    sleep(entity) {
        this.sleepManager.sleep(entity.id)
    }

    isAwake(entity) {
        return this.sleepManager.isAwake(entity.id)
    }

    isAsleep(entity) {
        return !this.sleepManager.isAwake(entity.id)
    }

    wake(entity) {
        this.sleepManager.wake(entity.id)
    }

    wakeOnce(entity) {
        this.sleepManager.wakeOnce(entity.id)
    }

    onMessage(message, client) {
        try {
            //console.log('message', message)
            var commandMessage = readCommandBuffer(message, this.protocols, this.config)
        } catch (err) {
            if (err) {
                console.log('onMessage error, disconnecting client', err)
                this.disconnect(client)
                //console.log(err.stack)
                this.pendingClients.delete(client.connection)
            }
            return
        }
        if (commandMessage.handshake !== -1) {
            if (typeof this.connectCallback === 'function') {
                var clientData = {
                    fromClient: commandMessage.handshake,
                    fromTransfer: null
                }

                this.connectCallback(client, clientData, (response) => {
                    if (typeof response === 'object') {
                        if (response.accepted) {
                            this.acceptConnection(client, response.text)
                        } else {
                            this.denyConnection(client, response.text)
                        }
                    }
                })
            }
        }

        if (!client.accepted) {
            return
        }

        if (commandMessage.pong !== -1) {
            client.latencyRecord.receivePong(commandMessage.pong)
            return // exit early,  message with PONG has nothing else of interest
        }

        client.lastReceivedDataTimestamp = Date.now()

        this.commands.push({
            tick: commandMessage.tick,
            pong: commandMessage.pong,
            client: client,
            commands: commandMessage.commands
        })
    }

    getNextCommand() {
        var cmd = this.commands.shift()
        //console.log(cmd)
        if (cmd && cmd.client.lastProcessedClientTick < cmd.tick) {
            cmd.client.lastProcessedClientTick = cmd.tick
        }
        return cmd
    }

    onConnect(callback) {
        this.connectCallback = callback
    }

    acceptConnection(client, text) {
        if (client.connection.readyState === 1) {
            this.pendingClients.delete(client.connection)
            this.addClient(client)
            client.accepted = true
    
            var bitBuffer = createConnectionResponseBuffer(true, text)
            var buffer = bitBuffer.toBuffer()

            if (client.connection.readyState === 1) {
                client.connection.send(buffer, { binary: true })
            }
        } else {
            // This client appears to have disconnected INBETWEEN the websocket connection forming
            // and the game logic choosing to accept the connection, so the game logic at this very moment
            // is probably running asynchronous code in an instance.on('connect', () => {}) block
            // We need to tell the game to disconnect this client.
            this.pendingClients.delete(client.connection)

            client.instance = null
            
            client.connection.close()
            if (typeof this.disconnectCallback === 'function') {
                this.disconnectCallback(client, null)
            }
        }
    }

    denyConnection(client, text) {
        this.pendingClients.delete(client.connection)

        var bitBuffer = createConnectionResponseBuffer(false, text)
        var buffer = bitBuffer.toBuffer()

        if (client.connection.readyState === 1) {
            client.connection.send(buffer, { binary: true })
            client.connection.close()
        }
    }

    connect(connection) {
        var client = new Client(this.config)
        client.connection = connection
        this.pendingClients.set(connection, client)
        return client
    }

    onDisconnect(callback) {
        this.disconnectCallback = callback
    }

    disconnect(client, event) {
        if (this.clients.get(client.id)) {
            this.clients.remove(client)
            client.instance = null
            
            if (typeof this.disconnectCallback === 'function') {
                this.disconnectCallback(client, event)
            }
            client.connection.close()
        } else {
            // This client appears to have disconnected INBETWEEN the websocket connection forming
            // and the game logic choosing to accept the connection, so the game logic at this very moment
            // is probably running asynchronous code in an instance.on('connect', () => {}) block
            // We need to tell the game to disconnect this client.
            if (this.pendingClients.has(client.connection)) {
                this.pendingClients.delete(client.connection)
                client.instance = null
                client.connection.close()
                if (typeof this.disconnectCallback === 'function') {
                    this.disconnectCallback(client, null)
                }
            }
        }
        return client
    }

    createChannel() {
        const channel = new Channel(this, this.channelId++)
        this.channels.add(channel)
        return channel
    }

    destroyChannel(channel) {
        channel.destroy()
    }

    addClient(client) {
        client.id = this.clientId++
        client.instance = this
        this.clients.add(client)
        return client
    }

    getClient(id) {
        return this.clients.get(id)
    }

    registerEntity(entity, sourceId) {
        // const id = this.entityIdPool.nextId()
        let nid = entity[this.config.ID_PROPERTY_NAME]
        if (!this.sources.has(nid)) {
            nid = this.entityIdPool.nextId()
            entity[this.config.ID_PROPERTY_NAME] = nid
            entity[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(entity.protocol)
            this.sources.set(nid, new Set())
            this._entities.add(entity)
        }
        const entitySources = this.sources.get(nid)
        entitySources.add(sourceId)
        //console.log('registered source', sourceId, nid)
        //console.log('sources', this.sources)
        return nid
    }

    unregisterEntity(entity, sourceId) {
        const nid = entity[this.config.ID_PROPERTY_NAME]
        const entitySources = this.sources.get(nid)
        entitySources.delete(sourceId)
        //console.log('unregistering source', sourceId, nid)

        if (entitySources.size === 0) {
            this.sources.delete(nid)
            this._entities.remove(entity)
            this.entityIdPool.queueReturnId(nid)
            entity[this.config.ID_PROPERTY_NAME] = -1
            //console.log('entity is fully unregistered now')
        }
    }

    addEntity(entity) {
        if (!entity.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }
        this.registerEntity(entity, -1)
        this.entities.add(entity)

        if (!this.config.USE_HISTORIAN) {
            this.basicSpace.insertEntity(entity)
        }
        return entity
    }

    removeEntity(entity) {
        if (!this.config.USE_HISTORIAN) {
            this.basicSpace.entities.remove(entity)
        }
        const id = entity[this.config.ID_PROPERTY_NAME]
        this.deleteEntities.push(id)
        this.entities.remove(entity)
        this.unregisterEntity(entity, -1)
        return entity
    }

    removeEntityAndComponents(entity) {
        const id = entity[this.config.ID_PROPERTY_NAME]
        const children = this.parents.get(id)
        if (children && children.size > 0) {
            children.forEach(nid => {
                const component = { [this.config.ID_PROPERTY_NAME]: nid }
                this.removeComponent(component, entity)
            })
        }
        this.removeEntity(entity)
        return entity
    }

    addComponent(component, parent) {
        const parentId = parent[this.config.ID_PROPERTY_NAME]
        const componentId = this.registerEntity(component, parentId)
        if (!this.parents.get(parentId)) {
            this.parents.set(parentId, new Set())
        }
        this.parents.get(parentId).add(componentId)
    }

    removeComponent(component, parent) {
        const parentId = parent[this.config.ID_PROPERTY_NAME]
        const componentId = component[this.config.ID_PROPERTY_NAME]
        this.parents.get(parentId).delete(componentId)
        this.unregisterEntity(component)
    }

    getEntity(id) {
        return this._entities.get(id)
    }

    addLocalMessage(lEvent) {
        if (!lEvent.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }

        lEvent[this.config.ID_PROPERTY_NAME] = this.eventId++
        lEvent[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(lEvent.protocol)

        if (this.config.USE_HISTORIAN) {
            this.localEvents.push(lEvent)
        } else {
            this.basicSpace.insertEvent(lEvent)
        }

        return lEvent
    }

    message(message, clientOrClients) {
        /*
        const recurse = (message) => {
            console.log('recurse', message.protocol)
            message[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(message.protocol)

            const properties = Object.keys(message.protocol.properties)
            properties.forEach(prop => {
                console.log('********', prop, message.protocol.properties[prop])
            })
        }
        //recurse(message)

        if (message.outers) {
            //console.log('>>>>>', message.protocol, message.outers[0].protocol, message.outers[0].inners[0].protocol)

            //message.outers[0].protocol
            //message.outers[0].protocol.properties.inners.protocol = message.outers[0].protocol.inners.prototype.protocol 
        }
        */

        if (!message.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }
        message[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(message.protocol)

        if (Array.isArray(clientOrClients)) {
            clientOrClients.forEach(client => {
                client.queueMessage(message)
            })
        } else {
            clientOrClients.queueMessage(message)
        }
        return message
    }

    messageAll(message) {
        this.message(message, this.clients.toArray())
    }

    sendJSON(json, clientOrClients) {
        var payload = (typeof json === 'string') ? json : JSON.stringify(json)

        if (Array.isArray(clientOrClients)) {
            clientOrClients.forEach(client => {
                client.queueJSON(payload)
            })
        } else {
            clientOrClients.queueJSON(payload)
        }
        return payload
    }

    proxifyOrGetCachedProxy(tick, entity) {
        if (this.proxyCache[tick].entities[entity.id]) {
            return this.proxyCache[tick].entities[entity.id]
        } else {
            if (!entity.protocol) {
                console.log('PROBLEM Entity/Component:', entity)
                throw new Error('nengi encountered an entity without a protocol. Did you forget to attach a protocol to an entity or list it in the config? Did you add an entity to the instance that was never supposed to be networked?')
            }
            var proxy = proxify(entity, entity.protocol)
            this.proxyCache[tick].entities[entity.id] = proxy

            if (this.proxyCache[tick - 1]) {

                //console.log('here')
                var proxyOld = this.proxyCache[tick - 1].entities[entity.id]
                if (proxyOld) {
                    proxy.diff = chooseOptimization(
                        this.config.ID_PROPERTY_NAME,
                        proxyOld,
                        proxy,
                        entity.protocol
                    )
                }
            }

            return proxy
        }
    }

    proxifyOrGetCachedProxyPerClient(client, entity, tick, isDiff) {
        let proxy
        if (this.proxyCache[tick].entities[entity[this.config.ID_PROPERTY_NAME]]) {
            proxy = this.proxyCache[tick].entities[entity[this.config.ID_PROPERTY_NAME]]
        } else {
            proxy = proxify(entity, entity.protocol)
            this.proxyCache[tick].entities[entity[this.config.ID_PROPERTY_NAME]] = proxy
        }

        if (proxy && proxy.diffTick === tick) {
            return proxy
        }
        //let old = client.entityCache.getEntity(entity.id)
        //console.log('found old', old)
        //if (old) {
        if (isDiff) {
            let proxyOld
            if (this.proxyCache[client.entityCache.lastTick]) {
                proxyOld = this.proxyCache[client.entityCache.lastTick].entities[entity[this.config.ID_PROPERTY_NAME]]
                //console.log('found old proxy')
            } else {
                //console.log('old')
                //proxyOld = proxify(old, entity.protocol)
                //this.proxyCache[tick].entities[entity.id] = proxyOld
                //console.log('had to reproxify an old object')
            }
            //var proxyOld = this.proxyCache[old._nTick].entities[entity.id]//proxify(old, entity.protocol)
            if (proxyOld) {
                this.debugCount++
                proxy.diff = chooseOptimization(
                    this.config.ID_PROPERTY_NAME,
                    proxyOld,
                    proxy,
                    entity.protocol
                )
                proxy.diffTick = tick
            } else {
                proxy.diff = {
                    singleProps: []
                }
                proxy.diffTick = tick
            }
        }

        // }
        //console.log('hey', proxy)
        return proxy
    }

    update() {
        //console.log('sources', this.sources)
        /*
        console.log(
            'entsA', this.entities.toArray().length, 
            'entsB', this._entities.toArray().length, 
            'clients', this.clients.toArray().length,
            'channels', this.channels.toArray().length
        )
        */
        


        //console.log(this.entities.toArray())
        if (this.config.USE_HISTORIAN) {
            this.historian.record(this.tick, this.entities.toArray(), this.localEvents)
        }

        this.localEvents = []


        //this.components.process()

        var spatialStructure = (this.config.USE_HISTORIAN) ? this.historian.getCurrentState() : this.basicSpace

        var now = Date.now()
        var clients = this.clients.toArray()

        for (var i = 0; i < clients.length; i++) {
            var client = clients[i]

            var snapshot = this.createSnapshot(this.tick, client, spatialStructure, now)
            var bitBuffer = createSnapshotBuffer(snapshot, this.config)
            var buffer = bitBuffer.toBuffer()

            if (client.connection.readyState === 1) {
                client.connection.send(buffer, { binary: true })
                client.saveSnapshot(snapshot, this.protocols, this.tick)
            }
        }

        delete this.proxyCache[this.tick - 20]

        //this.components.clear()
        this.noInterps = []
        this.deleteEntities = []
        this.createEntities = []
        this.entityIdPool.update()
        this.tick++

        //console.log('debug count', this.debugCount)
        this.debugCount = 0

        if (!this.config.USE_HISTORIAN) {
            this.basicSpace.flushEvents()
        }
    }

    createSnapshot(tick, client, spatialStructure, now) {
        //console.log('CREATE SNAPSHOT')
        if (typeof this.proxyCache[tick] === 'undefined') {
            this.proxyCache[tick] = {
                entities: {},
            }
        }

        var now = Date.now()

        // when timestamp is -1, no timesync is sent to the client
        //console.log(tick, tick % 100)
        var timestamp = (tick % this.config.UPDATE_RATE === 0) ? now : -1

        if (client.lastReceivedTick === -1) {
            timestamp = now
        }
        client.lastReceivedTick = tick


        //console.log('createSnapshot timestamp', timestamp)
        var avgLatency = Math.round(client.latencyRecord.averageLatency)
        //console.log('########', avgLatency)
        if (avgLatency > 999) {
            avgLatency = 999
        } else if (avgLatency < 0) {
            avgLatency = 0
        }

        var pingKey = (tick % this.config.PING_PONG_TICK_INTERVAL === 0) ? client.latencyRecord.generatePingKey() : -1

        var snapshot = {
            tick: tick,
            clientTick: client.lastProcessedClientTick,

            pingKey: pingKey, //client.latencyRecord.generatePingKey(),
            avgLatency: avgLatency,
            timestamp: timestamp,
            transferKey: client.transferKey,

            engineMessages: [],
            localEvents: [],
            messages: [],
            jsons: [],
            createEntities: [],
            deleteEntities: [],
            updateEntities: {
                full: [],
                partial: [],
                optimized: []
            }
        }

        //this.components.snapshotDecorate(snapshot)

        if (client.transferKey !== -1) {
            client.transferKey = -1
        }

        for (var i = 0; i < client.messageQueue.length; i++) {
            snapshot.messages.push(client.messageQueue[i])
        }
        client.messageQueue = []

        client.jsonQueue.forEach(json => {
            snapshot.jsons.push(json)
        })

        client.jsonQueue = []

        var vision = client.checkVisibility(spatialStructure, tick)

        // entity create
        for (var i = 0; i < vision.newlyVisible.length; i++) {
            let id = vision.newlyVisible[i]
            let entity = this.getEntity(id)
            let proxy = this.proxifyOrGetCachedProxyPerClient(client, entity, tick, false)
            proxy.protocol = entity.protocol
            //Object.freeze(proxy)
            snapshot.createEntities.push(proxy)

            //this.components.snapshotCreateEntity(entity, snapshot, tick)
        }

        var tempNoInterps = []
        for (var i = 0; i < vision.stillVisible.length; i++) {
            let id = vision.stillVisible[i]
            // console.log('doing id', id)
            let entity = this.getEntity(id)
            if (this.sleepManager.isAwake(entity[this.config.ID_PROPERTY_NAME])) {
                let proxy = this.proxifyOrGetCachedProxyPerClient(client, entity, tick, true)
                //console.log(proxy)

                //var proxyOld = client.entityCache.getEntity(id)

                let formattedUpdates = proxy.diff

                for (var j = 0; j < formattedUpdates.singleProps.length; j++) {
                    var singleProp = formattedUpdates.singleProps[j]
                    snapshot.updateEntities.partial.push(singleProp)
                }
            } else {
                this.proxifyOrGetCachedProxyPerClient(client, entity, tick, false)
            }

            //this.components.snapshotUpdateEntity(entity, snapshot, tick)

            if (this.noInterps.indexOf(id) !== -1) {
                tempNoInterps.push(id)
            }
        }

        if (tempNoInterps.length > 0) {
            var msg = new NoInterpsMessage(tempNoInterps)
            msg.protocol = this.protocols.getMetaProtocol(msg.type)
            snapshot.engineMessages.push(msg)
        }

        // entity delete
        for (var i = 0; i < vision.noLongerVisible.length; i++) {
            snapshot.deleteEntities.push(vision.noLongerVisible[i])
            let entity = this.getEntity(vision.noLongerVisible[i])
            //this.components.snapshotDeleteEntity(entity, snapshot)
        }
        // TODO alias 

        snapshot.localEvents = vision.events
        //console.log('snapshot', snapshot)
        return snapshot
    }
}

export default Instance;