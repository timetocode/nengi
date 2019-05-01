class Sleep {
    constructor() {
        this.sleepingIds = {}
    }

    isAwake(id) {
        return !this.sleepingIds[id]
    }

    sleep(id) {
        this.sleepingIds[id] = true
    }

    wake(id) {
        delete this.sleepingIds[id]
    }

    wakeOnce(id) {
        this.wake(id)
        setTimeout(() =>  {            
           this.sleep(id)
        }, 1)
    }
}

export default Sleep;