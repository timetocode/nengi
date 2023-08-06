import { Client } from './Client'
import { Frame, IEntityFrame } from './Frame'
declare const findInitialFrame: (frames: Frame[], renderTime: number) => Frame | null
declare const findSubsequentFrame: (frames: Frame[], previousTick: number) => Frame | null
declare class Interpolator {
    client: Client
    constructor(client: Client);
    getInterpolatedState(interpDelay: number): IEntityFrame[];
}
export { Interpolator, findInitialFrame, findSubsequentFrame }
