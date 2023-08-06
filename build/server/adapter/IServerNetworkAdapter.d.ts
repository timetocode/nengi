/// <reference types="node" />
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { User } from '../User'
interface IServerNetworkAdapter {
    listen(port: number, ready: () => void): void;
    send(user: User, buffer: Buffer | ArrayBuffer): void;
    disconnect(user: User, reason: any): void;
    createBuffer(lengthInBytes: number): Buffer | ArrayBuffer;
    createBufferWriter(lengthInBytes: number): IBinaryWriter;
    createBufferReader(buffer: Buffer | ArrayBuffer): IBinaryReader;
}
export { IServerNetworkAdapter }
