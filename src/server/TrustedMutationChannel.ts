import { Schema } from '../common/binary/schema/Schema'
import {
    ManualChannel,
    ManualGroupHandle,
    ManualGroupWriter,
    ManualPropHandle,
    ManualPropWriter,
    ManualSchemaHandles,
    ManualTypeWriters
} from './ManualChannel'

/**
 * Compatibility alias for the previous manual-channel terminology.
 * New code should import ManualChannel and call manual/createEntityWriter.
 */
export class TrustedMutationChannel extends ManualChannel {
    trusted(ntype: number, schema: Schema) {
        return this.manual(ntype, schema)
    }
}

export {
    ManualGroupHandle as TrustedGroupHandle,
    ManualGroupWriter as TrustedGroupWriter,
    ManualPropHandle as TrustedPropHandle,
    ManualPropWriter as TrustedPropWriter,
    ManualSchemaHandles as TrustedSchemaHandles,
    ManualTypeWriters as TrustedTypeWriters
}
