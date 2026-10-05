import { performance } from 'node:perf_hooks'
import { Binary } from '../common/binary/Binary'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Component, EcsWorld, ecs } from '../ecs/EcsWorld'
import { Instance } from '../server/Instance'
import { EcsChannel } from '../server/channel/EcsChannel'
import { EcsChannel2D } from '../server/channel/EcsChannel2D'
import { EcsChannel3D } from '../server/channel/EcsChannel3D'
import { bindEcsChannel } from '../server/channel/EcsChannelBinding'

export type BindingWorkloadConfig = {
    channel: 'plain' | '2d' | '3d'
    operation: 'prop' | 'group' | 'patch' | 'raw-prop' | 'raw-group'
    entities: number
    warmup: number
    ticks: number
}

type TransformState = Component & { ntype: 1, x: number, y: number, z: number, rotation: number }
const Transform = ecs.defineComponent<TransformState>(1, 'Transform')

export function buildBindingWorkload(config: BindingWorkloadConfig) {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        z: Binary.Float64,
        rotation: Binary.Float64,
        $options: { updateGroups: { pose: ['x', 'y', 'rotation'] } }
    }))
    const instance: Instance = new Instance(context, { now: () => 1000 + instance.tick })
    const world = new EcsWorld()
    const channel = config.channel === 'plain' ? new EcsChannel(instance.localState) :
        config.channel === '2d' ? new EcsChannel2D(instance.localState, 512) : new EcsChannel3D(instance.localState, 512)
    const binding = bindEcsChannel(world, channel, { context })
    const network = binding.component(Transform)
    const components: ReturnType<typeof network.add>[] = []
    for (let i = 0; i < config.entities; i++) {
        const pid = binding.createEntity()
        const values = { x: i % 256, y: 0, z: 0, rotation: 0 }
        components.push('addSpatial' in network ? network.addSpatial(pid, values) : network.add(pid, values))
    }
    const raw = channel.createComponentWriter(1, context.getSchema(1)!)
    instance.step()

    function mutate(tick: number) {
        for (let i = 0; i < components.length; i++) {
            const component = components[i]
            const x = i % 256 + (tick % 100) * 0.25
            const y = (tick % 80) * 0.25
            const rotation = (tick % 60) * 0.01
            switch (config.operation) {
            case 'prop':
                network.mutate.props.x(component, x)
                break
            case 'group':
                network.mutate.groups.pose(component, x, y, rotation)
                break
            case 'patch':
                network.mutate.patch(component, { x, y, rotation })
                break
            case 'raw-prop':
                component.x = x
                raw.props.x(component, x)
                break
            case 'raw-group':
                component.x = x
                component.y = y
                component.rotation = rotation
                raw.groups.pose(component, x, y, rotation)
                break
            }
        }
    }

    function finish() {
        // Flush spatial pending writes before cleanup, as snapshot preparation
        // would. No subscribers or serialization are timed by this workload.
        if (!(channel instanceof EcsChannel)) channel.getManualCellUpdateLog(config.channel === '2d' ? '0:0' : '0:0:0')
        instance.step()
    }

    return { instance, channel, components, mutate, finish }
}

function summarize(values: number[]) {
    const sorted = values.slice().sort((a, b) => a - b)
    const round = (value: number) => Number(value.toFixed(3))
    return {
        avg: round(values.reduce((sum, value) => sum + value, 0) / values.length),
        p50: round(sorted[Math.floor(sorted.length * 0.5)]),
        p95: round(sorted[Math.floor(sorted.length * 0.95)]),
        max: round(sorted[sorted.length - 1])
    }
}

export function runBindingWorkload(config: BindingWorkloadConfig, afterWarmup?: () => void) {
    const workload = buildBindingWorkload(config)
    const mutationMs: number[] = []
    const totalMs: number[] = []
    for (let tick = 0; tick < config.warmup + config.ticks; tick++) {
        if (tick === config.warmup) afterWarmup?.()
        const start = performance.now()
        workload.mutate(tick)
        const mutated = performance.now()
        workload.finish()
        const finished = performance.now()
        if (tick >= config.warmup) {
            mutationMs.push(mutated - start)
            totalMs.push(finished - start)
        }
    }
    return { mutationMs: summarize(mutationMs), totalMs: summarize(totalMs), entities: workload.components.length }
}

if (require.main === module) {
    const config: BindingWorkloadConfig = {
        channel: (process.env.PROFILE_CHANNEL || 'plain') as BindingWorkloadConfig['channel'],
        operation: (process.env.PROFILE_OPERATION || 'prop') as BindingWorkloadConfig['operation'],
        entities: Number(process.env.PROFILE_ENTITIES || 10000),
        warmup: Number(process.env.PROFILE_WARMUP || 50),
        ticks: Number(process.env.PROFILE_TICKS || 150)
    }
    if (!['plain', '2d', '3d'].includes(config.channel)) throw new Error('Unknown binding channel')
    if (!['prop', 'group', 'patch', 'raw-prop', 'raw-group'].includes(config.operation)) throw new Error('Unknown binding operation')
    for (const key of ['entities', 'warmup', 'ticks'] as const) {
        if (!Number.isSafeInteger(config[key]) || config[key] < (key === 'warmup' ? 0 : 1)) throw new Error(`Invalid ${key}`)
    }
    console.log(JSON.stringify({ config, result: runBindingWorkload(config) }, null, 2))
}
