
import Binary from '../binary/Binary.js';

function IdPool(binaryType) {
    this.min = 0
    this.max = Binary[binaryType].max

    this.pool = []
    for (var i = 0; i < this.max; i++) {
        this.pool.push(i)
    }

    this.queue = []
}

IdPool.prototype.nextId = function() {
    if (this.pool.length > 0) {
        return this.pool.pop()
    }
    throw new Error('IdPool overflow')
}

IdPool.prototype.returnId = function(id) {
    if (id >= this.min && id <= this.max) {
        this.pool.unshift(id)
    }
}


IdPool.prototype.queueReturnId = function(id) {
    this.queue.push(id)
}

IdPool.prototype.update = function() {
    for (var i = 0; i < this.queue.length; i++) {
        this.returnId(this.queue[i])
    }
    this.queue = []
}

export default IdPool;