import { Client } from './Client';
import { Frame, IEntityFrame } from './Frame';
export declare const findInitialFrame: (frames: Frame[], renderTime: number) => Frame | null;
export declare const findSubsequentFrame: (frames: Frame[], previousTick: number) => Frame | null;
export declare class Interpolator {
    client: Client;
    constructor(client: Client);
    getInterpolatedState(interpDelay: number): IEntityFrame[];
}
//# sourceMappingURL=Interpolator.d.ts.map