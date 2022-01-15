import BinaryType from './binary/BinaryType'

const defaults = {
    USE_HISTORIAN: true,
    HISTORIAN_TICKS: 40,
    ID_PROPERTY_NAME: 'nid',
    ID_BINARY_TYPE: BinaryType.UInt16,
    TYPE_PROPERTY_NAME: 'ntype',
    TYPE_BINARY_TYPE: BinaryType.UInt8,
    DIMENSIONALITY: 2,
    PING_PONG_TICK_INTERVAL: 1,
    PREDICTION_EPSILON: 0.0001
}

export default defaults