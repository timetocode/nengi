import { CulledChannel } from './CulledChannel'
import { LocalState } from './LocalState'
import { AABB3D } from './AABB3D'
import { Point3D } from './Point3D'

const pointInAABB3D = (p: Point3D, view: AABB3D) => {
    const startX = view.x - view.halfWidth
    const startY = view.y - view.halfHeight
    const startZ = view.z - view.halfDepth
    const endX = view.x + view.halfWidth
    const endY = view.y + view.halfHeight
    const endZ = view.z + view.halfDepth

    return (
        p.x >= startX &&
        p.x < endX &&
        p.y >= startY &&
        p.y < endY &&
        p.z >= startZ &&
        p.z < endZ
    )
}

export class ChannelAABB3D extends CulledChannel<Point3D, AABB3D> {
    constructor(localState: LocalState, ntype: number) {
        super(localState, ntype)
        this.visibilityResolver = pointInAABB3D
    }
}