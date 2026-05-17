class Schema {
    keys: any[]
    props: { [key: string]: any }
    kind: 'entity' | 'message' | 'payload'

    constructor(kind: 'entity' | 'message' | 'payload' = 'payload') {
        this.keys = []
        this.props = {}
        this.kind = kind
    }
}

export { Schema }
