import B from '../binary/BinaryType.js';

class NoInterpsMessage {
    constructor(ids) {
        this.type = 66
        this.ids = ids
    }
}

NoInterpsMessage.protocol = {
    ids: { type: B.UInt32, indexType: B.UInt32  }
}

export default NoInterpsMessage;
