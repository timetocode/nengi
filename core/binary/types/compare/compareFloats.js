export default function compareFloats(a, b) {
    return {
        a: a,
        b: b,
        isChanged: a !== b
    }
};