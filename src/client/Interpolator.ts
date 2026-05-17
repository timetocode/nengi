import { Client } from './Client'
import { IEntityFrame } from './Frame'

export class Interpolator {
    client: Client

    constructor(client: Client) {
        this.client = client
    }

    getInterpolatedState(interpDelay: number): IEntityFrame[] {
        return this.client.network.drainFrames()
    }
}
