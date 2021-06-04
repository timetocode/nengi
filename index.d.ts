

declare interface EDictionary {
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
    import EventEmitter from 'events'

    type NameAndClassTuple = any
    // why not? [string, new (...args: any[]) => Class] ; causes typescript errors
    export interface Config {
        [prop: string]: any // misc config variables
        protocols: {
            entities: NameAndClassTuple[],
            localMessages: NameAndClassTuple[],
            messages: NameAndClassTuple[],
            commands: NameAndClassTuple[],
            basics: NameAndClassTuple[],
        }
    }
    export class Channel {
        /**
         * Not intended for direct use, instead use instance.createChannel()
         * @param instance 
         * @param id 
         */
        constructor(instance: Instance, id: number)

        /**
         * Adds an entity to the channel. Will attach a nid/ntype to the entity.
         * @param entity 
         */
        addEntity(entity: any)

        /**
         * Removes an entity from the channel
         * @param entity 
         */
        removeEntity(entity: any)

        /**
         * Adds a message to the channel
         * @param message 
         */
        addMessage(message: any)

        /**
         * Adds a client to the channel
         * @param client
         */
        subscribe(client: any)

        /**
         * Removes a client from the channel
         * @param client 
         */
        unsubscribe(client: any)

        /**
         * Destroys a channel, important for memory clean up. Will automatically unsubscribe clients, and remove contained entities.
         */
        destroy()
    }

    export interface View {
        x: number
        y: number
        z?: number
        halfWidth: number
        halfHeight: number
        halfDepth?: number
    }
    export interface CommandCollection {
        tick: number
        client: ConnectedClient
        commands: any[]
    }

    export interface ConnectedClient {
        // public
        id: number
        latency: number
        view: View
        connection: any
        [prop: string]: any

        // private ish
        config: Config
        accepted: boolean        
        lastReceivedDataTimestamp: Date
        lastReceivedTick: number
        lastProcessedClientTick: number
        latencyRecord: any               
        entityIds: number[]
        messageQueue: any[]
        jsonQueue: any[]
        entityCache: any
        cache: any
        cacheArr: any[]
        channels: Channel[]
        cr: any[]
        de: any[]
        addCreate(id: number)
        addDelete(id: number)
        subscribe(channel: Channel)
        unsubcribe(channel: Channel)
        queueMessage(message: any)
        queueJSON(json: any)
        createOrUpdate(id: number, tick: number, toCreate: number[], toUpdate: number[])
        checkVisibility(spatialStructure: any, tick: number)
        saveSnapshot(snapshot: any, protocols: any, tick: number)
    }
    export class Instance extends EventEmitter {
        constructor(config: Config, webConfig: any)

        clients: EDictionary
        config: Config

        //on(event: 'disconnect', callback: (client: any) => {}): void
        //on(event: string, callback: (a: any, b: any, c: any) => {}): void
        //on(event: string, callback: (a: any, b: any) => {}): void
        //on(event: string, callback: (client: ConnectedClient) => void): void

        // Warning: this function is only present if a nengi hooks mixin has been used.
        emitCommands(): void

        /**
         * (NOT WORKING) Disables interpolation for an entity for one frame.
         * @param nid 
         */
        noInterp(nid: number): void

        /**
         * Sleeps an entity, aka stops nengi from scanning the entity for changes each tick
         * @param entity 
         */
        sleep(entity: any): void

        /**
         * Returns true if entity is awake
         * @param entity 
         */
        isAwake(entity: any): boolean

        /**
         * Returns true if entity is asleep
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

        /**
         * Sets the callback that will be invoked when a client connects.
         * @param {} connectCallback
         * Example of accepting everyone:
         * ```js
         * instance.onConnect(client, data, (acceptOrDenyCallback) => {
         *    acceptOrDenyCallback({ accepted: true, text: 'Welcome!'})
         * })
         * ```
         * Advanced authentication example:
         * ```js
         * instance.onConnect(client, data, async (acceptOrDenyCallback) => {
         *    const user = await authService.verify(data.token) // hypothetical token passed
         *    if (user) {
         *      client.user = user // could contain data from a db
         *      acceptOrDenyCallback({ accepted: true, text: 'Welcome!'})
         *    } else {
         *      acceptOrDenyCallback({ accepted: false, text: 'Unauthenticated'})
         *    } 
         * })
         * ```
         */
        onConnect(connectCallback: (client: ConnectedClient, data: any, acceptOrDenyCallback: ({ accepted, text }: { accepted: boolean, text: string }) => void) => void): void

        /**
         * Sets the callback that will be invoked when a client disonnects.
         * Example:
         * ```js
         * instance.onDisconnect((client) => {
         *    // clean up! (hypothetical)
         *    if (client.entity) {
         *      instance.removeEntity(client.entity)
         *    }
         * })
         * ```
         * @param client 
         */
        onDisconnect(callback: (client: ConnectedClient) => void)

        /**
         * Returns the next incoming command from a queue and marks it as processed. Will return undefined if no more commands are queued.
         */
        getNextCommand(): CommandCollection | undefined


        // none of these are intended for public consumption
        //onMessage(message: any, client: any): void
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
        message(message: any, clientOrClients: ConnectedClient | ConnectedClient[]): any

        /**
         * Sends a message to all clients.
         * @param message
         */
        messageAll(message: any): void

        /**
         * Creates and returns a new Channel
         */
        createChannel(): Channel

        /**
         * Sends network snapshots to all clients. To be invoked towards the end of a game tick in most cases.
         */
        update(): void
    }

    export interface ClientInterpolatedViewStateSnapshot {
        messages: any[]
        localMessages: any[]
        entities: EntityStateSnapshot[]
        jsons: any[]
        predictionErrors: any[]
    }

    export interface EntityUpdate {
        [prop: string]: any // placeholder for configurable nid property
        prop: string
        value: any
        path: string[]
    }
    export interface EntityStateSnapshot {
        createEntities: any[]
        updateEntities: EntityUpdate[]
        deleteEntities: number[]
    }

    export class Client {
        constructor(config: Config, interDelay: number)

        // allow any prop to be attached to Client, aka normal JavaScript
        [prop: string]: any
        config: Config

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
         * @returns {ClientInterpolatedViewStateSnapshot}
         */
        readNetwork(): ClientInterpolatedViewStateSnapshot

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
