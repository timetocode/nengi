import { CulledChannel } from './CulledChannel';
import { LocalState } from './LocalState';
import { AABB3D } from './AABB3D';
import { Point3D } from './Point3D';
declare class ChannelAABB3D extends CulledChannel<Point3D, AABB3D> {
    constructor(localState: LocalState);
}
export { ChannelAABB3D };
