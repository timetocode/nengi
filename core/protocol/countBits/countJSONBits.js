import utf8 from 'utf8';

function countJSONBits(json) {
    return 32 + (utf8.encode(json).length * 8)
}

export default countJSONBits;