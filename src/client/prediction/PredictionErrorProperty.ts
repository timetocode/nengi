class PredictionErrorProperty {
    nid: number
    prop: string
    predictedValue: any
    actualValue: any

    constructor(nid: number, prop: string, predictedValue: any, actualValue: any) {
        this.nid = nid
        this.prop = prop
        this.predictedValue = predictedValue
        this.actualValue = actualValue
    }
}

export { PredictionErrorProperty }