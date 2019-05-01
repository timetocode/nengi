export default function compareIntegers(a, b) {
    var intA = Math.floor(a)
    var intB = Math.floor(b)
    return {
        a: intA,
        b: intB,
        isChanged: intA !== intB
    }
};