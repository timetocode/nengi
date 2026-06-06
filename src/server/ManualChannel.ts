import { LocalState } from './LocalState'
import { ChannelOptions } from './Channel'
import { TrustedMutationChannel } from './TrustedMutationChannel'

export class ManualChannel extends TrustedMutationChannel {
    constructor(localState: LocalState, options: ChannelOptions = {}) {
        super(localState, options)
    }
}
