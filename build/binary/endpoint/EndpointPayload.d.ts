import { IBinaryReader } from '../../common/binary/IBinaryReader';
import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { Schema } from '../../common/binary/schema/Schema';
type JsonEndpointPayload = {
    kind: 'json';
    value: string;
};
type SchemaEndpointPayload = {
    kind: 'schema';
    schema: Schema;
    value: any;
};
type EndpointPayload = JsonEndpointPayload | SchemaEndpointPayload;
declare function createEndpointPayload(value: any, schema?: Schema): EndpointPayload;
declare function countEndpointPayload(payload: EndpointPayload): number;
declare function writeEndpointPayload(payload: EndpointPayload, writer: IBinaryWriter): void;
declare function readEndpointPayload(reader: IBinaryReader, schema?: Schema): any;
declare function readSizedEndpointPayload(reader: IBinaryReader, byteLength: number, schema?: Schema): any;
declare function skipEndpointPayload(reader: IBinaryReader, byteLength: number): void;
export { EndpointPayload, countEndpointPayload, createEndpointPayload, readEndpointPayload, readSizedEndpointPayload, skipEndpointPayload, writeEndpointPayload };
//# sourceMappingURL=EndpointPayload.d.ts.map