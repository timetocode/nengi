import { default as cws } from '@clusterws/cws'
import EDictionary from '../../external/EDictionary.js';
import Historian from './Historian.js';
import IdPool from './IdPool.js';
import proxify from '../protocol/proxify.js';
import compare from '../protocol/compare.js';
import copyProxy from '../protocol/copyProxy.js';
import Binary from '../binary/Binary.js';
import BinaryType from '../binary/BinaryType.js';
import formatUpdates from '../snapshot/entityUpdate/formatUpdates.js';
import chooseOptimization from '../snapshot/entityUpdate/chooseOptimization.js';
import ProtocolMap from '../protocol/ProtocolMap.js';
import Client from './Client.js';
import createSnapshotBuffer from '../snapshot/writer/createSnapshotBuffer.js';
import readCommandBuffer from '../snapshot/reader/readCommandBuffer.js';
import createConnectionResponseBuffer from '../snapshot/writer/createConnectionResponseBuffer.js';
import createTransferClientBuffer from '../snapshot/writer/createTransferClientBuffer.js';
import createTransferRequestBuffer from '../snapshot/writer/createTransferRequestBuffer.js';
import createTransferResponseBuffer from '../snapshot/writer/createTransferResponseBuffer.js';
import createHandshakeBuffer from '../snapshot/writer/createHandshakeBuffer.js';

import consoleLogLogo from '../common/consoleLogLogo.js';
import metaConfig from '../common/metaConfig.js';
import NoInterpsMessage from '../common/NoInterpsMessage.js';
import Sleep from './Sleep.js';

import BasicSpace from './BasicSpace.js';
import { EventEmitter } from 'events'

//const Components = require('./Components')
const defaults = {
    USE_HISTORIAN: true,
    HISTORIAN_TICKS: 40,
    ID_PROPERTY_NAME: 'nid',
    ID_BINARY_TYPE: BinaryType.UInt16,
    TYPE_PROPERTY_NAME: 'ntype',
    TYPE_BINARY_TYPE: BinaryType.UInt8
}


class Instance extends EventEmitter {
    constructor(config, webConfig) {
		super()
        /* defaults */
        if (!config) {
            throw new Error('Instance requries a nengiConfig')
        } else {
            for (let prop in defaults) {
                if (typeof(config[prop]) === 'undefined'){
                    config[prop] = defaults[prop]
                }
            }
        }

        this.config = config
        this.transferPassword = webConfig.transferPassword
        this.protocols = new ProtocolMap(config, metaConfig) 
        // console.log(this.protocols.lookupByProtocol.entries().next().value[0])

        this.sleepManager = new Sleep()
        this.tick = 0

        this.clientId = 0
        this.entityId = 0
        this.eventId = 0
        this.channelId = 0

        this.entityIdPool = new IdPool(config.ID_BINARY_TYPE)

        this.pendingClients = new Map()
        this._entities = new EDictionary(config.ID_PROPERTY_NAME)
        this.clients = new EDictionary()
        this.entities = new EDictionary(config.ID_PROPERTY_NAME)
        this.channels = new EDictionary()

        this.localEvents = []
        this.proxyCache = {}

        //this.components = new Components(this)

        this.historian = new Historian(config.UPDATE_RATE, config.HISTORIAN_TICKS, config.ID_PROPERTY_NAME)
        // if no history
        this.basicSpace = new BasicSpace(config.ID_PROPERTY_NAME)

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

        consoleLogLogo()

        if (typeof webConfig.port !== 'undefined') {
            this.wsServer = new cws.WebSocketServer({ port: webConfig.port })
        } else if (typeof webConfig.httpServer !== 'undefined') {
            this.wsServer = new cws.WebSocketServer({ server: webConfig.httpServer })
        } else {
            throw new Error('Instance must be passed a config that contains a port or an http server.')
        }

        this.wsServer.on('connection', (ws, req) => {
            //console.log('HERE?', req, ws._socket.remoteAddress)
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

                this.connectCallback(client, clientData, response => {
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
        // TODO:NN temporary fix
        // if (cmd && cmd.client.lastProcessedClientTick < cmd.tick) {
        if (cmd) {
            cmd.client.lastProcessedClientTick = cmd.tick
        }
        return cmd
    }

    onConnect(callback) {
        this.connectCallback = callback
    }

    acceptConnection(client, text) {
        this.pendingClients.delete(client.connection)
        this.addClient(client)
        client.accepted = true

        var bitBuffer = createConnectionResponseBuffer(true, text)
        var buffer = bitBuffer.toBuffer()

        if (client.connection.readyState === 1) {
            client.connection.send(buffer, { binary: true })
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
            client.id = -1
            client.instance = null
            this.clients.remove(client)
            if (typeof this.disconnectCallback === 'function') {
                this.disconnectCallback(client, event)
            }
            client.connection.close()
        }
        return client
    }

    addChannel(channel) {
        channel.id = this.channelId++
        channel.protocols = this.protocols
        channel.config = this.config
        channel.entityIdPool = this.entityIdPool
        channel.instance = this
        this.channels.add(channel)
    }

    removeChannel(channel) {
        channel.clients.forEach(client => channel.unsubscribe(client))
        channel.entities.forEach(entity => channel.removeEntity(entity))
        this.channels.remove(channel)
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

    addEntity(entity) {
        if (!entity.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }
        const id = this.entityIdPool.nextId()
        entity[this.config.ID_PROPERTY_NAME] = id 
        entity[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(entity.protocol)
        this.entities.add(entity)

        if (!this.config.USE_HISTORIAN) {
            this.basicSpace.insertEntity(entity)
        }

        //this.components.addEntity(entity)
        //this.createEntities.push(entity[this.config.ID_PROPERTY_NAME])


        //console.log('E', entity)
        return entity
    }

    removeEntity(entity) {
        if (!this.config.USE_HISTORIAN) {
            this.basicSpace.entities.remove(entity)
        }
		const id = entity[this.config.ID_PROPERTY_NAME]
		
        this.deleteEntities.push(id)
        this.entityIdPool.queueReturnId(id)
        entity[this.config.ID_PROPERTY_NAME] = -1
        this.entities.remove(entity)      

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
        const componentId = this.entityIdPool.nextId()

        component[this.config.ID_PROPERTY_NAME] = componentId
        component[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(component.protocol)

        if (!this._entities.get(componentId)) {
            this._entities.add(component)
        }

        if (!this.parents.get(parentId)) {
            this.parents.set(parentId, new Set())
        }
        this.parents.get(parentId).add(componentId) 
    }


    removeComponent(component, parent) {
        const parentId = parent[this.config.ID_PROPERTY_NAME]           
        const componentId = component[this.config.ID_PROPERTY_NAME]

        this.entityIdPool.queueReturnId(componentId)
        this._entities.remove(component)
        component[this.config.ID_PROPERTY_NAME] = -1
        this.parents.get(parentId).delete(componentId)
    }


    getEntity(id) {
        // TEMP for provisional channel / component api
        // TODO: single source of truth for entities
        // with spatial entities as a lens
        const ent = this.entities.get(id)
        if (ent) {
            return ent
        }
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
            proxy =  this.proxyCache[tick].entities[entity[this.config.ID_PROPERTY_NAME]]
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

        var snapshot = {
            tick: tick,
            clientTick: client.lastProcessedClientTick,

            pingKey: client.latencyRecord.generatePingKey(),
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