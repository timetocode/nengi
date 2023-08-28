export class AABB3D {
    x: number
    y: number
    z: number

    halfWidth: number
    halfHeight: number
    halfDepth: number

    constructor(x: number, y: number, z: number, halfWidth: number, halfHeight: number, halfDepth: number) {
        this.x = x
        this.y = y
        this.z = z
        this.halfWidth = halfWidth
        this.halfHeight = halfHeight
        this.halfDepth = halfDepth
    }
}