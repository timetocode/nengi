import { Client } from './Client';
import { Frame, IEntityFrame } from './Frame';
declare class Interpolator {
    client: Client;
    latestFrame: Frame | null;
    frames: Frame[];
    constructor(client: Client);
    getInterpolatedState(): IEntityFrame[];
}
export { Interpolator };
