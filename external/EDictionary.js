class EDictionary {
    constructor(ID_PROPERTY_NAME) {
        this.ID_PROPERTY_NAME = ID_PROPERTY_NAME || 'id'
        this.object = {}
        this.array = []
    }

    get size() {
        return this.array.length
    }

    get(id) {
        var obj = this.object[id]
        if (typeof obj !== 'undefined') {
            return this.object[id]
        }
        return null 
    }

    forEach(fn) {
        for (let i = 0; i < this.array.length; i++) {
            fn(this.array[i], i)
        }
    }

    toArray() {
        return this.array
    }

    add(obj) {
        if (typeof obj === 'object' && typeof obj[this.ID_PROPERTY_NAME] !== 'undefined') {
            this.object[obj[this.ID_PROPERTY_NAME]] = obj
            this.array.push(obj)
        } else {
            throw new Error('EDictionary could not add object, invalid object or object.id.')
        }
    }

    remove(obj) {
        if (typeof obj === 'object' && typeof obj[this.ID_PROPERTY_NAME] !== 'undefined') {
            return this.removeById(obj[this.ID_PROPERTY_NAME])
        } else {
            //throw new Error('EDictionary could not remove object, invalid object or object.id.')
        }
    }

    removeById(id) {
        if (typeof id !== 'undefined') {
            var index = -1
            for (var i = 0; i < this.array.length; i++) {
                if (this.array[i][this.ID_PROPERTY_NAME] === id) {
                    index = i
                    break
                }
            }
            if (index !== -1) {
                this.array.splice(index, 1)
            } else {
                //throw new Error('EDictionary could not remove object, id not found.')
            }
            var temp = this.object[id]
            delete this.object[id]
            return temp
        } else {
            //throw new Error('EDictionary could not removeById, invalid id.')
        }
    }
}

export default EDictionary
