import { Client } from './Client'

class RawReader {
    client: Client
    constructor(client: Client) {
        this.client = client
    }
}

export default RawReader