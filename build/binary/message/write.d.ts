/// <reference types="node" />
import { Schema } from '../../common/binary/schema/Schema';
import { Buffer } from 'buffer';
declare function write(buffer: Buffer, offset: number, obj: any, schema: Schema): number;
export default write;
