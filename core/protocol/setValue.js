export default function setValue(obj, path, value) {
    if (!path || !obj) {
        return
    }
    if (path.length === 1) {
        obj[path[0]] = value
    } else if (path.length === 2) {
        if (typeof obj[path[0]] === 'undefined') {
            obj[path[0]] = {}
        }
        obj[path[0]][path[1]] = value
    } else if (path.length === 3) {
        if (typeof obj[path[0]] === 'undefined') {
            obj[path[0]] = {}
        }
        if (typeof obj[path[0]][path[1]] === 'undefined') {
            obj[path[0]][path[1]] = {}
        }
        obj[path[0]][path[1]][path[2]] = value
    }
};