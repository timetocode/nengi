"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalTime = getLocalTime;
function getLocalTime() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}
