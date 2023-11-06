import { CulledChannel } from './CulledChannel'
import { LocalState } from './LocalState'
import { AABB2D } from './AABB2D'
import { Point2D } from './Point2D'

const pointInAABB2D = (p: Point2D, view: AABB2D) => {
    const startX = view.x - view.halfWidth
    const startY = view.y - view.halfHeight
    const endX = view.x + view.halfWidth
    const endY = view.y + view.halfHeight

    return (
        p.x >= startX &&
        p.x < endX &&
        p.y >= startY &&
        p.y < endY
    )
}

export class ChannelAABB2D extends CulledChannel<Point2D, AABB2D> {
    constructor(localState: LocalState) {
        super(localState, pointInAABB2D)
    }
}