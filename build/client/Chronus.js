'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.Chronus = void 0
class Chronus {
    constructor() {
        this.timeDifferences = []
        this.averageTimeDifference = 0
    }
    register(timestamp) {
        this.timeDifferences.push(Date.now() - timestamp)
        while (this.timeDifferences.length > 20) {
            this.timeDifferences.shift()
        }
        let total = 0
        for (var i = 0; i < this.timeDifferences.length; i++) {
            total += this.timeDifferences[i]
        }
        this.averageTimeDifference = total / this.timeDifferences.length
    }
}
exports.Chronus = Chronus
//# sourceMappingURL=Chronus.js.map