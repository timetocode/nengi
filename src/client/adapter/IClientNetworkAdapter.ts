import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'

interface IClientNetworkAdapter {
    connect(wsUrl: string, handshake: any): Promise<any>
    flush(): void
	//disconnect(): void
	createBuffer(lengthInBytes: number): Buffer | ArrayBuffer
	createBufferWriter(lengthInBytes: number): IBinaryWriter
	createBufferReader(buffer: Buffer | ArrayBuffer): IBinaryReader
}

export { IClientNetworkAdapter  }