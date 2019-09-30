import { EventEmitter } from 'events'

const connectionMocker = () => {
    const createSockets = () =>{
        const serverSocket = new EventEmitter()
        const clientSocket = new EventEmitter()
        serverSocket.readyState = 1
        serverSocket.send = (buffer) => {
            clientSocket.emit('message', buffer)
        }

        clientSocket.send = (buffer) => {
            serverSocket.emit('message', buffer)
        }

        return { serverSocket, clientSocket }
    }

    // outer object takes the place of a websocket server
    // pass this to an instance
    const mock = new EventEmitter()

    // opens a mock connection between a client and instance
    mock.mockConnect = (client, handshake) => {
        // interior objects are a pair of websockets
        const { serverSocket, clientSocket } = createSockets()
        client.mockConnect(clientSocket, handshake)
        mock.emit('connection', serverSocket)
        clientSocket.emit('open')
    }

    return mock
}

export default connectionMocker