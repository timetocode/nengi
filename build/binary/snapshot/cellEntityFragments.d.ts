import { Instance } from '../../server/Instance';
import { BinaryPayload } from '../../common/binary/BinaryAdapter';
import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
export type CellEntityFragment = {
    payload: BinaryPayload;
    bytes: number;
    nids: Set<number>;
    creates: number;
    deletes: number;
    updateProps: number;
    updateGroups: number;
    groupedUpdateProps: number;
};
export declare function writeCellFragments(writer: IBinaryWriter, instance: Instance, fragments: CellEntityFragment[]): void;
export declare function sumCellFragmentBytes(fragments: CellEntityFragment[]): number;
export declare function sumCellFragmentCreates(fragments: CellEntityFragment[]): number;
export declare function sumCellFragmentDeletes(fragments: CellEntityFragment[]): number;
export declare function sumCellFragmentUpdateProps(fragments: CellEntityFragment[]): number;
export declare function sumCellFragmentUpdateGroups(fragments: CellEntityFragment[]): number;
export declare function sumCellFragmentGroupedProps(fragments: CellEntityFragment[]): number;
//# sourceMappingURL=cellEntityFragments.d.ts.map