import ProtocolMap from '../protocol/ProtocolMap'
import metaConfig from '../common/metaConfig'
import createHandshakeBuffer from '../snapshot/writer/createHandshakeBuffer'
import readSnapshotBuffer from '../snapshot/reader/readSnapshotBuffer'
import EntityCache from '../instance/EntityCache'
import WorldState from './WorldState'
import Outbound from './Outbound'
import Interpolator from './Interpolator'
import createPongBuffer from '../snapshot/writer/createPongBuffer'
import Chronus from './Chronus'
import Predictor from './Predictor'
import { EventEmitter } from 'events'

class Client extends EventEmitter {
    constructor(config, interpDelay) {
        super()
        this.config = config
        this.protocols = new ProtocolMap(config, metaConfig)

        this.interpDelay = (typeof interpDelay === 'undefined') ? 100 : interpDelay
        this.connectionOpen = null
        this.connectionClose = null
        this.websocket = null
        this.snapshots = []
    }

    init() {
        this.outbound = new Outbound(this.protocols, this.websocket, this.config)
        this.chronus = new Chronus()

        this.entityCache = new EntityCache(this.config)
        this.interpolator = new Interpolator(this.config)

        this.latestWorldState = null
        this.serverTick = 0
        this.tickLength = 1000 / this.config.UPDATE_RATE

        this.cr = []
        this.up = []
        this.de = []

        this.averagePing = 100
        this.pings = []
        this.timeDifference = -1
        this.timeDifferences = []
        this.avgDiff = 0
        this.avgDiffs = []

        this.messages = []
        this.localMessages = []
        this.jsons = []
        this.predictionErrors = []

        this.predictions = {}
        this.predictor = new Predictor(this.config)
    }

    get tick() {
        return this.outbound.clientTick
    }

    addPrediction(tick, entity, props) {
        this.predictor.add(tick, entity, props)
    }

    addCustomPrediction(tick, entity, props) {
        this.predictor.addCustom(tick, entity, props)
    }

    disconnect() {
        if (this.websocket) {
            this.websocket.close()
        }
    }

    handleMessage(message) {
        let snapshot = readSnapshotBuffer(
            message.data,
            this.protocols,
            this.config,
            this.connectionOpen,
            this.transferCallback,
            (id) => {
                return this.entityCache.getEntity(id).protocol
            }
        )
        // some messages aren't snapshots (connection & transfer)
        if (!snapshot) {
            return
        }

        /* ping */
        if (snapshot.pingKey !== -1) {
            var pongBuffer = createPongBuffer(snapshot.pingKey)
            this.websocket.send(pongBuffer.byteArray)
        }
        if (snapshot.avgLatency !== -1) {
            this.averagePing = snapshot.avgLatency
        }
        /* end ping */

        this.messages = this.messages.concat(snapshot.messages)
        this.localMessages = this.localMessages.concat(snapshot.localMessages)
        this.jsons = this.jsons.concat(snapshot.jsons)

        snapshot.createEntities.forEach(entity => {
            this.entityCache.saveEntity(entity, entity.protocol)
            this.cr.push(entity)
        })
        snapshot.updateEntities.partial.forEach(update => {
            this.entityCache.updateEntityPartial(update.id, update.path, update.value)
            this.up.push(update)
        })

        snapshot.deleteEntities.forEach(id => {
            this.entityCache.deleteEntity(id)
            this.de.push(id)
        })

        //console.log('snapshot', this.averagePing, this.avgDiff, snapshot.createEntities.length, snapshot.updateEntities.partial.length, snapshot.deleteEntities.length)

        let worldState = new WorldState(this.serverTick, this.tickLength, snapshot, this.latestWorldState, this.config)

        this.chronus.register(worldState.timestamp)
        this.outbound.confirmCommands(worldState.clientTick)

        this.latestWorldState = worldState
        // TODO unconfirmed commands
        //console.log('investigating', worldState.clientTick)
        let predictionErrorFrame = this.predictor.getErrors(worldState)
        if (predictionErrorFrame.entities.size > 0) {
            this.predictionErrors.push(predictionErrorFrame)
        }

        this.predictor.cleanUp(worldState.clientTick)
        // console.log('predictionERrors', this.predictionErrors.length)

        this.snapshots.push(worldState)
        this.serverTick++
    }

    connect(address, handshake) {
        this.init()

        this.websocket = new WebSocket(address, 'nengi-protocol')
        this.outbound.websocket = this.websocket
        this.websocket.binaryType = 'arraybuffer'

        if (typeof handshake === 'undefined' || !handshake) {
            handshake = {}
        }

        this.websocket.onopen = (event) => {
            this.websocket.send(createHandshakeBuffer(handshake).byteArray)
        }

        this.websocket.onerror = (err) => {
            console.log('WebSocket error', err)
        }

        this.websocket.onclose = () => {
            if (this.connectionClose) {
                this.connectionClose()
            }
        }

        this.websocket.onmessage = (message) => {
            if (message.data instanceof ArrayBuffer) {
                this.handleMessage(message)
            } else if (typeof message.data === 'string') {
                console.log('received string data from server, ignoring')
            } else {
                console.log('unknown websocket data type')
            }
        }
    }

    mockConnect(mockSocket, handshake) {
        this.init()

        this.websocket = mockSocket
        this.outbound.websocket = this.websocket
        this.websocket.binaryType = 'arraybuffer'

        if (typeof handshake === 'undefined' || !handshake) {
            handshake = {}
        }

        this.websocket.on('open', (event) => {
            this.emit('connected', event)
            this.websocket.send(createHandshakeBuffer(handshake).byteArray)
        })

        this.websocket.on('error', (err) => {
            console.log('WebSocket error', err)
        })

        this.websocket.on('close', () => {
            this.emit('disconnected')
            if (this.connectionClose) {
                this.connectionClose()
            }
        })

        this.websocket.on('message', (message) => {
            console.log('message', message)
            this.handleMessage({ data: message })
        })
    }

    readNetwork() {
        if (this.snapshots[this.snapshots.length - 20]) {
            if (this.snapshots[this.snapshots.length - 20].processed) {
                this.snapshots.splice(this.snapshots.length - 20, 1)
            }
        }

        //console.log('this.chronus.averageTimeDifference', this.chronus.averageTimeDifference)

        //console.log('t', this.snapshots.length)

        let obj = this.interpolator.interp(
            this.snapshots,
            Date.now() - this.interpDelay - this.chronus.averageTimeDifference,
            this.predictor
        )
        obj.messages = this.messages.splice(0, this.messages.length)
        obj.localMessages = this.localMessages.splice(0, this.localMessages.length)
        obj.jsons = this.jsons.splice(0, this.jsons.length)
        obj.predictionErrors = this.predictionErrors.splice(0, this.predictionErrors.length)

        return obj

    }

    readNetworkAndEmit() {
        const network = this.readNetwork()

        network.messages.forEach((message) => {
            this.emit(`message::${message.protocol.name}`, message)
        })

        network.localMessages.forEach((localMessage) => {
            this.emit(`message::${localMessage.protocol.name}`, localMessage)
        })

        network.entities.forEach((snapshot) => {
            snapshot.createEntities.forEach((entity) => {
                this.emit(`create::${entity.protocol.name}`, entity)
                this.emit(`create`, entity)
            })

            snapshot.updateEntities.forEach((update) => {
                this.emit(`update`, update)
            })

            snapshot.deleteEntities.forEach((id) => {
                this.emit(`delete`, id)
            })
        })

        network.predictionErrors.forEach((predictionErrorFrame) => {
            this.emit(`predictionErrorFrame`, predictionErrorFrame)
        })
    }

    getUnconfirmedCommands() {
        return this.outbound.getUnconfirmedCommands()
    }

    onConnect(cb) {
        this.connectionOpen = cb
    }

    onClose(cb) {
        this.connectionClose = cb
    }

    update() {
        this.outbound.update()
    }

    addCommand(command) {
        this.outbound.addCommand(command)
    }
}

export default Client