class PredictionEntity {
    nid: number
    state: { [prop: string]: any }
    props: string[]

    constructor(nid: number, entity: any, props: string[]) {
        this.nid = nid
        this.state = entity
        this.props = props
    }
}

export { PredictionEntity }