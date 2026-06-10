"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicPositionSmoother2D = void 0;
/**
 * Follows a raw authoritative position with a public presentation position.
 * Good connections can stay effectively identical via settleDistance, while
 * large raw jumps from command bursts are smoothed for observers.
 */
class PublicPositionSmoother2D {
    constructor(options) {
        var _a, _b, _c;
        this.getRaw = options.getRaw;
        this.getPublic = options.getPublic;
        this.setPublic = options.setPublic;
        this.followSpeed = (_a = options.followSpeed) !== null && _a !== void 0 ? _a : 420;
        this.snapDistance = (_b = options.snapDistance) !== null && _b !== void 0 ? _b : 240;
        this.settleDistance = (_c = options.settleDistance) !== null && _c !== void 0 ? _c : 10;
    }
    step(target, dtMs) {
        const raw = this.getRaw(target);
        const published = this.getPublic(target);
        const dx = raw.x - published.x;
        const dy = raw.y - published.y;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) {
            return { distance, moved: false, snapped: false };
        }
        if (distance <= this.settleDistance || distance >= this.snapDistance) {
            this.setPublic(target, raw.x, raw.y);
            return { distance, moved: true, snapped: distance >= this.snapDistance };
        }
        const maxMove = Math.max(0, this.followSpeed) * Math.max(0, dtMs) / 1000;
        if (maxMove >= distance) {
            this.setPublic(target, raw.x, raw.y);
            return { distance, moved: true, snapped: false };
        }
        const ratio = maxMove / distance;
        this.setPublic(target, published.x + dx * ratio, published.y + dy * ratio);
        return { distance, moved: maxMove > 0, snapped: false };
    }
}
exports.PublicPositionSmoother2D = PublicPositionSmoother2D;
