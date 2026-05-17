import { Client } from './Client';
import { IEntityFrame } from './Frame';
export declare class Interpolator {
    client: Client;
    constructor(client: Client);
    getInterpolatedState(interpDelay: number): IEntityFrame[];
}
//# sourceMappingURL=Interpolator.d.ts.map