class Schema {
    keys: any[]
    props: { [key: string]: any }

    constructor() {
        this.keys = []
        this.props = {}
    }
}

export { Schema }
