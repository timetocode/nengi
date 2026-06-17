import { Instance } from '../../server/Instance'
import { BinaryPayload } from '../../common/binary/BinaryAdapter'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { writePayload } from './snapshotPayload'

export type CellEntityFragment = {
    payload: BinaryPayload
    bytes: number
    nids: Set<number>
    creates: number
    deletes: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
}

export function writeCellFragments(writer: IBinaryWriter, instance: Instance, fragments: CellEntityFragment[]) {
    for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i]
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, fragment.payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragment.bytes)
        }
    }
}

export function sumCellFragmentBytes(fragments: CellEntityFragment[]) {
    let bytes = 0
    for (let i = 0; i < fragments.length; i++) {
        bytes += fragments[i].bytes
    }
    return bytes
}

export function sumCellFragmentCreates(fragments: CellEntityFragment[]) {
    let creates = 0
    for (let i = 0; i < fragments.length; i++) {
        creates += fragments[i].creates
    }
    return creates
}

export function sumCellFragmentDeletes(fragments: CellEntityFragment[]) {
    let deletes = 0
    for (let i = 0; i < fragments.length; i++) {
        deletes += fragments[i].deletes
    }
    return deletes
}

export function sumCellFragmentUpdateProps(fragments: CellEntityFragment[]) {
    let updates = 0
    for (let i = 0; i < fragments.length; i++) {
        updates += fragments[i].updateProps
    }
    return updates
}

export function sumCellFragmentUpdateGroups(fragments: CellEntityFragment[]) {
    let updates = 0
    for (let i = 0; i < fragments.length; i++) {
        updates += fragments[i].updateGroups
    }
    return updates
}

export function sumCellFragmentGroupedProps(fragments: CellEntityFragment[]) {
    let props = 0
    for (let i = 0; i < fragments.length; i++) {
        props += fragments[i].groupedUpdateProps
    }
    return props
}
