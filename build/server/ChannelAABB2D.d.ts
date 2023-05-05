import { CulledChannel } from './CulledChannel';
import { LocalState } from './LocalState';
import { AABB2D } from './AABB2D';
import { Point2D } from './Point2D';
declare class ChannelAABB2D extends CulledChannel<Point2D, AABB2D> {
    constructor(localState: LocalState);
}
export { ChannelAABB2D };
