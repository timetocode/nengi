// Type definitions for [~THE LIBRARY NAME~] [~OPTIONAL VERSION NUMBER~]
// Project: [~THE PROJECT NAME~]
// Definitions by: [~YOUR NAME~] <[~A URL FOR YOU~]>

declare namespace nengi {
    export class Instance {
        constructor(config: any, webConfig: any)

        noInterp(id: number): void

        //sleep(entity: any): void
        //isAwake(entity: any): boolean
        //isAsleep(entity: any): boolean
        //wake(entity: any): void
        //wakeOnce(entity: any): void

        onMessage(message: any, client: any): void
        getNextCommand(): any

        onConnect(callback: any):void
        onDisconnect(callback: any):void

        //acceptConnection(client: any, text: string): void
        //denyConnection(client: any, text: string): void
        //connect(connection: any)

        addEntity(entity: any): void
        removeEntity(entity: any): void
        getEntity(id: number): any
        message(message: any, clientOrClients: any): any
        messageAll(message: any): void
        update(): void
    }

    export const Boolean: number

    export const Int2: number
    export const UInt2: number

    export const Int3: number
    export const UInt3: number

    export const Int4: number
    export const UInt4: number

    export const Int6: number
    export const UInt6: number

    export const Int8: number
    export const UInt8: number

    export const Int10: number
    export const UInt10: number

    export const Int12: number
    export const UInt12: number

    export const Int16: number
    export const UInt16: number

    export const Int32: number
    export const UInt32: number

    export const Number: number
    export const Float32: number
    export const Float64: number
    export const RotationFloat32: number
    export const ASCIIString: number
    export const String: number
    export const UTF8String: number


}

export = nengi