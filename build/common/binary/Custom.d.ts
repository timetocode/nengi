import { IBinaryReader } from './IBinaryReader';
import { IBinaryWriter } from './IBinaryWriter';
declare class CustomWriter {
    bw: IBinaryWriter;
    constructor(bw: IBinaryWriter);
    addCustom(): void;
    writeVector2(vector2: {
        x: number;
        y: number;
    }): void;
    writeVector3(vector3: {
        x: number;
        y: number;
        z: number;
    }): void;
    writeQuaternion(quaternion: {
        x: number;
        y: number;
        z: number;
        w: number;
    }): void;
}
declare class CustomReader {
    br: IBinaryReader;
    constructor(br: IBinaryReader);
    addCustom(): void;
    readVector2(): {
        x: number;
        y: number;
    };
    readVector3(): {
        x: number;
        y: number;
        z: number;
    };
    readQuaternion(): {
        x: number;
        y: number;
        z: number;
        w: number;
    };
}
export { CustomWriter, CustomReader };
