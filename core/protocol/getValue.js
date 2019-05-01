export default function getValue(obj, path) {
    //console.log('getValue', obj, path)
    //if (path) {
        if (path.length === 1) {
            return obj[path[0]]
        } else if (path.length === 2) {
            return obj[path[0]][path[1]]
        } else if (path.length === 3) {
            return obj[path[0]][path[1]][path[2]]
        } else {
            throw new Error('proxify property path is too deep, 3 layer nest limit: obj.a.b.c; obj: ' + obj + ' path: ' + path)
        }
    //}
};
