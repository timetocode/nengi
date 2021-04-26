// Type definitions for nengi.js
// Project: https://timetocode.com/nengi
// Definitions by: Alex // timetocode <https://github.com/timetocode>

interface EDictionary {
    /**
     * Iterates through the EDictionary
     * @param fn Provides (obj: any, i: number) to your function
     */
    forEach(fn: (obj: any, i: number) => void): void

    /**
     * Adds an object to the EDictionary. The object *MUST* have a nid/id property as defined in the nengiConfig
     * @param obj 
     */
    add(obj: any): void

    /**
     * Removes an object from the EDictionary by reference
     * @param obj 
     */
    remove(obj: any): void

    /**
     * Removes an object from the EDictionary by type
     * @param id 
     */
    removeById(id: number): void

    /**
     * Provides access to the underlying data as an array. There is no performance penalty as the underlying data *is* an array. Do not mutate it, use add and remove instead.
     */
    toArray(): any[]
}

declare namespace nengi {
    export class Instance {
        constructor(config: any, webConfig: any)

        clients: EDictionary

        //on(event: 'disconnect', callback: (client: any) => {}): void
        //on(event: string, callback: (a: any, b: any, c: any) => {}): void
        //on(event: string, callback: (a: any, b: any) => {}): void
        on(event: string, callback: (client: any) => void): void

        // Warning: this function is only present if a nengi hooks mixin has been used.
        emitCommands(): void

        /**
         * (NOT WORKING) Disables interpolation for an entity for one frame.
         * @param nid 
         */
        noInterp(nid: number): void

        /**
         * Sleeps an entity, aka stops nengi from scanning the entity for changes each fick
         * @param entity 
         */
        sleep(entity: any): void

        /**
         * Returns true if entity is awake
         * @param entity 
         */
        isAwake(entity: any): boolean

        /**
         * Rreturns true if entity is asleep
         * @param entity
         */
        isAsleep(entity: any): boolean

        /**
         * Wakes an entity, aka enables nengi scanning the entity for changes each tick
         * @param entity 
         */
        wake(entity: any): void

        /**
         * Wakes an entity for one server tick, so that changes to it will be networked. Entity will return to sleep the following tick.
         * @param entity
         */
        wakeOnce(entity: any): void

        // none of these are intended for public consumption
        //onMessage(message: any, client: any): void
        //getNextCommand(): any
        //onConnect(callback: any): void
        //onDisconnect(callback: any): void
        //acceptConnection(client: any, text: string): void
        //denyConnection(client: any, text: string): void
        //connect(connection: any)

        /**
         * Adds an entity to the game instance where it will be automatically synchronized to game clients. Assigns a nid and ntype to the entity.
         * @param entity 
         */
        addEntity(entity: any): void

        /**
         * Removes an entity from the instance, causes it to disappear from all game clients. Changes entity nid to -1.
         * @param entity
         */
        removeEntity(entity: any): void

        /**
         * Gets an entity from the instance by nid. Will scan channels and all forms of visibility.
         * @param id 
         */
        getEntity(id: number): any

        /**
         * Sends a message to one or more clients.
         * 
         * @param message Message
         * @param clientOrClients A client or an array of clients
         */
        message(message: any, clientOrClients: any): any

        /**
         * Sends a message to all clients.
         * @param message
         */
        messageAll(message: any): void

        /**
         * Sends network snapshots to all clients. To be invoked towards the end of a game tick in most cases.
         */
        update(): void
    }

    export class Client {
        constructor(config: any, interDelay: number)
        /**
         * Connect to an instance
         * 
         * @param address Address, e.g. ws://localhost:8001
         * @param handshake (optional) Handshake object with any properties and values to pass to the server.
         */
        connect(address: string, handshake?: any): void

        /**
         * Adds a command to the outbound queue
         * @param command 
         */
        addCommand(command: any): void

        /**
         * Reads any queued data from the server, and returns them in snapshot format.
         * @returns {object}
         */
        readNetwork(): any

        /**
         * Flushes (sends) any outbound commands.
         */
        update(): void

        /**
         * Reads any queued data from the server and emits it in the nengi hooks api format. Warning: this function is only present if a nengi hooks mixin has been used.
         */
        readNetworkAndEmit(): any

        // TODO
        on(event: string, callback: (message: any) => void): void
    }

    /**
     * Holds a boolean value, serializes over the network to 1 bit
     */
    export const Boolean: number

    /**
     * Holds any integer in the range 0 to3
     */
    export const UInt2: number

    /**
     * Holds any integer in the range 0 to 7
     */
    export const UInt3: number

    /**
     * Holds any integer in the range -8 to 7
     */
    export const Int4: number

    /**
     * Holds any integer in the range 0 to 15
     */
    export const UInt4: number

    /**
     * Holds any integer in the range -32 to 31
     */
    export const Int6: number

    /**
     * Holds any integer in the range 0 to 61
     */
    export const UInt6: number

    /**
     * Holds any integer in the range -128 to 127
     */
    export const Int8: number

    /**
     * Holds any integer in the range 0 to 255
     */
    export const UInt8: number

    /**
     * Holds any integer in the range -512 to 511
     */
    export const Int10: number

    /**
     * Holds any integer in the range 0 to 1023
     */
    export const UInt10: number

    /**
     * Holds any integer in the range 0 to 4095
     */
    export const UInt12: number

    /**
     * Holds any integer in the range -32768 to 32767
     */
    export const Int16: number

    /**
     * Holds any integer in the range 0 to 65535
     */
    export const UInt16: number

    /**
     * Holds any integer in the range -2147483648 to 2147483647
     */
    export const Int32: number

    /**
     * Holds any integer in the range 0 to 4294967295
     */
    export const UInt32: number

    /**
     * Holds a JavaScript Number (64 bit), same as Float64
     */
    export const Number: number

    /**
     * Holds a 32 bit floating point, half the resolution of Float64 aka Number
     */
    export const Float32: number

    /**
     * Holds a 64 bit floating point, same as Number
     */
    export const Float64: number

    /**
     * Holds a 32 bit floating point that will be interpolated around
     */
    export const RotationFloat32: number

    /**
     * Holds a string with a max length of 255 where each character is networked as byte (not utf8 safe!).
     */
    export const ASCIIString: number

    /**
     * Alias to UTF8String
     */
    export const String: number

    /**
     * Holds a string of UTF8 characters, maximum 4294967295 bytes
     */
    export const UTF8String: number


}

export = nengi
