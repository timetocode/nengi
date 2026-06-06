import { AABB2D } from './AABB2D'
import { LocalState } from './LocalState'
import { Point2D } from './Point2D'
import {
    TrustedMutationSpatialChannel,
    TrustedMutationSpatialChannelOptions
} from './TrustedMutationSpatialChannel'

export class ManualSpatialChannel extends TrustedMutationSpatialChannel {
    constructor(localState: LocalState, cellSize: number, options: TrustedMutationSpatialChannelOptions = {}) {
        super(localState, cellSize, options)
    }
}

export type ManualSpatialChannelOptions = TrustedMutationSpatialChannelOptions
export type ManualSpatialVisibleObject = Point2D
export type ManualSpatialView = AABB2D
