"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chronus = void 0;
class Chronus {
    constructor() {
        this.timeDifferences = [];
        this.averageTimeDifference = 0;
    }
    register(timestamp, now = Date.now()) {
        this.timeDifferences.push(now - timestamp);
        while (this.timeDifferences.length > 20) {
            this.timeDifferences.shift();
        }
        let total = 0;
        for (let i = 0; i < this.timeDifferences.length; i++) {
            total += this.timeDifferences[i];
        }
        this.averageTimeDifference = total / this.timeDifferences.length;
    }
}
exports.Chronus = Chronus;
