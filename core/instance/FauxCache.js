
class FauxCache {
    constructor() {
        this.lastTick = -1
    }    

    saveSnapshot(snapshot, protocols, tick) {
        this.lastTick = tick
    }
}

export default FauxCache;