function calculateValue(oldValue, newValue, isDelta) {
    // TODO: integer rounding when floats are schema'd as ints
    if (isDelta) {
        return newValue - oldValue
    } else {
        return newValue
    }
}

export default calculateValue;