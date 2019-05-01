class SpatialChannel {
    constructor() {
        this.entities = []
        this.messages = []
    }

    addEntity(entity) {

    }

    addMessage(message) {

    }

    subscribe(client) {
        client.subscribe(this)
    }

    unsubscribe(client) {
        client.unsubscribe(this)
    }
}

export default Channel;