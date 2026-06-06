import {
    ManualSpatialCellLog,
    ManualSpatialChannel,
    ManualSpatialChannelOptions,
    ManualSpatialMove,
    ManualSpatialTypeWriters
} from './ManualSpatialChannel'

/**
 * Compatibility alias for the previous manual spatial-channel terminology.
 * New code should import ManualSpatialChannel.
 */
export class TrustedMutationSpatialChannel extends ManualSpatialChannel {
}

export {
    ManualSpatialCellLog as TrustedSpatialCellLog,
    ManualSpatialChannelOptions as TrustedMutationSpatialChannelOptions,
    ManualSpatialMove as TrustedSpatialMove,
    ManualSpatialTypeWriters as TrustedSpatialTypeWriters
}
