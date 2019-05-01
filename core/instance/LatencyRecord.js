function randomInt(min, max) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min
}


function LatencyRecord() {
    this.pingsSent = {}
    this.latencies = []
    this.averageLatency = 100 // default
}

LatencyRecord.prototype.generatePingKey = function() {
    var pingKey = randomInt(0, 255)

    if (!this.pingsSent[pingKey]) {
        this.pingsSent[pingKey] = Date.now()
        return pingKey
    } else {
        return -1
    }
}

LatencyRecord.prototype.receivePong = function(pingKey) {
    if (this.pingsSent[pingKey]) {
        var latency = Date.now() - this.pingsSent[pingKey]
        this.latencies.push(latency)

        //console.log('rec pong', latency)

        delete this.pingsSent[pingKey]


    }
    this.calculateAverageLatency()
}

LatencyRecord.prototype.calculateAverageLatency = function() {
    var total = 0
    for (var i = 0; i < this.latencies.length; i++) {
        total += this.latencies[i]
    }
    if (total > 0 && this.latencies.length > 0) {
        this.averageLatency = total / this.latencies.length
        //console.log('avg ping', this.averageLatency)
    }

    while (this.latencies.length > 5) {
        this.latencies.shift()
    } 
}


export default LatencyRecord