import type { User } from './User'

/** Finite instance budgets. Byte charges describe encoded data, not heap usage. */
export const DEFAULT_NETWORK_LIMITS = Object.freeze({
    maxConnections: 4096,
    maxPendingConnections: 256,
    maxPacketBytes: 64 * 1024,
    packetsPerSecond: 1024,
    packetBurst: 2048,
    bytesPerSecond: 128 * 1024,
    byteBurst: 256 * 1024,
    maxQueuedCommandsPerUser: 1024,
    maxQueuedCommands: 65536,
    maxQueuedRequestsPerUser: 128,
    maxQueuedRequests: 65536,
    maxQueuedInputBytesPerUser: 1024 * 1024,
    maxQueuedInputBytes: 64 * 1024 * 1024,
    maxQueuedEvents: 65536,
    maxQueuedResponsesPerUser: 1024,
    maxQueuedResponses: 65536,
    maxQueuedResponseBytesPerUser: 1024 * 1024,
    maxQueuedResponseBytes: 64 * 1024 * 1024
})

export type NetworkLimits = { readonly [K in keyof typeof DEFAULT_NETWORK_LIMITS]: number }
export type NetworkLimitEvent = {
    user: User
    limit: keyof NetworkLimits
    value: number
    maximum: number
}

export function resolveNetworkLimits(options: Partial<NetworkLimits> = {}): NetworkLimits {
    const limits: { -readonly [K in keyof NetworkLimits]: number } = { ...DEFAULT_NETWORK_LIMITS }
    for (const key of Object.keys(options)) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_NETWORK_LIMITS, key)) throw new Error(`Unknown network limit ${key}.`)
        const name = key as keyof NetworkLimits
        const value = options[name]
        if (value !== undefined) limits[name] = value
    }
    for (const [key, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error(`Network limit ${key} must be a positive safe integer.`)
        }
    }
    if (limits.byteBurst < limits.maxPacketBytes) {
        throw new Error('Network limit byteBurst must be at least maxPacketBytes.')
    }
    return Object.freeze(limits)
}

export class NetworkLimitError extends Error {
    constructor(readonly limit: keyof NetworkLimits, readonly value: number, readonly maximum: number) {
        super(`Network limit ${limit} exceeded: ${value} > ${maximum}.`)
    }
}
