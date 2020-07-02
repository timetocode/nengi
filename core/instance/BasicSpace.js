
// the most basic spatial structure that will work with nengi's instance
import EDictionary from '../../external/EDictionary'

function BasicSpace(ID_PROPERTY_NAME, DIMENTIONALITY) {
    this.DIMENTIONALITY = DIMENTIONALITY
    this.ID_PROPERTY_NAME = ID_PROPERTY_NAME || 'id'
    this.entities = new EDictionary(ID_PROPERTY_NAME)
    this.events = new EDictionary(ID_PROPERTY_NAME)
}

BasicSpace.create = function (ID_PROPERTY_NAME) {
    return new BasicSpace(ID_PROPERTY_NAME)
}

BasicSpace.prototype.insertEntity = function (entity) {
    this.entities.add(entity)
}

BasicSpace.prototype.insertEvent = function (event) {
    this.events.add(event)
}

BasicSpace.prototype.flushEvents = function () {
    this.events = new EDictionary(this.ID_PROPERTY_NAME)
}

const queryAreaEMap2D = (aabb, entities, ID_PROPERTY_NAME) => {
    const minX = aabb.x - aabb.halfWidth
    const minY = aabb.y - aabb.halfHeight
    const maxX = aabb.x + aabb.halfWidth
    const maxY = aabb.y + aabb.halfHeight

    const entitiesInArea = new Map()

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]

        if (entity.x <= maxX
            && entity.x >= minX
            && entity.y <= maxY
            && entity.y >= minY) {

            entitiesInArea.set(entity[ID_PROPERTY_NAME], entity)
        }
    }
    return entitiesInArea
}

const queryAreaEMap3D = (aabb, entities, ID_PROPERTY_NAME) => {
    const minX = aabb.x - aabb.halfWidth
    const minY = aabb.y - aabb.halfHeight
    const minZ = aabb.z - aabb.halfDepth
    const maxX = aabb.x + aabb.halfWidth
    const maxY = aabb.y + aabb.halfHeight
    const maxZ = aabb.z + aabb.halfDepth

    const entitiesInArea = new Map()

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]

        if (entity.x <= maxX
            && entity.x >= minX
            && entity.y <= maxY
            && entity.y >= minY
            && entity.z >= minZ
            && entity.z <= maxZ) {

            entitiesInArea.set(entity[ID_PROPERTY_NAME], entity)
        }
    }
    return entitiesInArea
}

BasicSpace.prototype.queryAreaEMap = function (aabb) {
    const entities = this.entities.toArray()
    if (this.DIMENTIONALITY === 2) {
        return queryAreaEMap2D(aabb, entities, this.ID_PROPERTY_NAME)
    } else if (this.DIMENTIONALITY === 3) {
        return queryAreaEMap3D(aabb, entities, this.ID_PROPERTY_NAME)
    } else {
        throw new Error('nengi supports 2D and 3D only')
    }
}

const queryArea3D = (aabb, entities, events) => {
    const minX = aabb.x - aabb.halfWidth
    const minY = aabb.y - aabb.halfHeight
    const minZ = aabb.z - aabb.halfDepth
    const maxX = aabb.x + aabb.halfWidth
    const maxY = aabb.y + aabb.halfHeight
    const maxZ = aabb.z + aabb.halfDepth

    const entitiesInArea = []
    const eventsInArea = [] 

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]

        if (entity.x <= maxX
            && entity.x >= minX
            && entity.y <= maxY
            && entity.y >= minY
            && entity.z >= minZ
            && entity.z <= maxZ) {

            entitiesInArea.push(entity)
        }
    }

    for (var i = 0; i < events.length; i++) {
        const event = events[i]

        if (event.x <= maxX
            && event.x >= minX
            && event.y <= maxY
            && event.y >= minY
            && event.z >= minZ
            && event.z <= maxZ) {

            eventsInArea.push(event)
        }
    }
    return { entities: entitiesInArea, events: eventsInArea }
}

const queryArea2D = (aabb, entities, events) => {
    const minX = aabb.x - aabb.halfWidth
    const minY = aabb.y - aabb.halfHeight
    const maxX = aabb.x + aabb.halfWidth
    const maxY = aabb.y + aabb.halfHeight

    const entitiesInArea = []
    const eventsInArea = [] 

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]

        if (entity.x <= maxX
            && entity.x >= minX
            && entity.y <= maxY
            && entity.y >= minY) {

            entitiesInArea.push(entity)
        }
    }

    for (var i = 0; i < events.length; i++) {
        const event = events[i]

        if (event.x <= maxX
            && event.x >= minX
            && event.y <= maxY
            && event.y >= minY) {

            eventsInArea.push(event)
        }
    }
    return { entities: entitiesInArea, events: eventsInArea }
}

BasicSpace.prototype.queryArea = function (aabb) {
    const entities = this.entities.toArray()
    const events = this.events.toArray()

    if (this.DIMENTIONALITY === 2) {
        return queryArea2D(aabb, entities, events)
    } else if (this.DIMENTIONALITY === 3) {
        return queryArea3D(aabb, entities, events)
    } else {
        throw new Error('nengi supports 2D and 3D only')
    }
}

BasicSpace.prototype.release = function () {

}

export default BasicSpace