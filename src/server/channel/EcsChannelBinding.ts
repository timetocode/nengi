import { Context } from '../../common/Context'
import { IEntity } from '../../common/IEntity'
import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'
import {
    Component,
    ComponentDefinition,
    ComponentOf,
    EcsWorld,
    Pid
} from '../../ecs/EcsWorld'
import { EcsChannel, EcsComponent, EcsTypeWriters } from './EcsChannel'
import { Ecs2DComponent, Ecs2DTypeWriters, EcsChannel2D } from './EcsChannel2D'
import { Ecs3DComponent, Ecs3DTypeWriters, EcsChannel3D } from './EcsChannel3D'

export type BoundEcsChannel = EcsChannel | EcsChannel2D | EcsChannel3D
export type BoundEcsComponent = EcsComponent | Ecs2DComponent | Ecs3DComponent
export type SpatialEcsChannel = EcsChannel2D | EcsChannel3D

type BoundChannelComponent<Channel extends BoundEcsChannel> =
    Channel extends EcsChannel2D ? Ecs2DComponent :
    Channel extends EcsChannel3D ? Ecs3DComponent :
    EcsComponent

type BoundComponent<Channel extends BoundEcsChannel, Definition extends ComponentDefinition<any>> =
    ComponentOf<Definition> & BoundChannelComponent<Channel>

export type EcsNetworkComponentState<Definition extends ComponentDefinition<any>> =
    Omit<ComponentOf<Definition>, 'pid' | 'nid' | 'ntype'>

type NetworkStateKey<Definition extends ComponentDefinition<any>> =
    keyof EcsNetworkComponentState<Definition> & string

type EcsBoundPropertyNamespace<
    ComponentType extends BoundEcsComponent,
    Definition extends ComponentDefinition<any>
> = {
    readonly [Key in NetworkStateKey<Definition>]: (
        component: ComponentType,
        value: EcsNetworkComponentState<Definition>[Key]
    ) => void
}

export type EcsBoundWriter<
    ComponentType extends BoundEcsComponent,
    Definition extends ComponentDefinition<any>
> = {
    readonly props: EcsBoundPropertyNamespace<ComponentType, Definition>
    readonly groups: Record<string, (component: ComponentType, ...values: any[]) => void>
}

export type EcsBoundMutators<
    Channel extends BoundEcsChannel,
    Definition extends ComponentDefinition<any>
> = {
    readonly props: EcsBoundPropertyNamespace<BoundComponent<Channel, Definition>, Definition>
    readonly groups: Record<string, (component: BoundComponent<Channel, Definition>, ...values: any[]) => void>
    patch(component: BoundComponent<Channel, Definition>, values: Partial<EcsNetworkComponentState<Definition>>): void
}

export type EcsBoundComponentBindingBase<
    Channel extends BoundEcsChannel,
    Definition extends ComponentDefinition<any>
> = {
    readonly definition: Definition
    readonly writer: EcsBoundWriter<BoundComponent<Channel, Definition>, Definition>
    readonly mutate: EcsBoundMutators<Channel, Definition>
    add(pid: Pid, state: EcsNetworkComponentState<Definition>): BoundComponent<Channel, Definition>
    remove(componentOrPid: BoundComponent<Channel, Definition> | Pid): void
}

export type EcsBoundComponentBinding<
    Channel extends BoundEcsChannel,
    Definition extends ComponentDefinition<any>
> = EcsBoundComponentBindingBase<Channel, Definition> & (
    Channel extends SpatialEcsChannel ? {
        addSpatial(pid: Pid, state: EcsNetworkComponentState<Definition>): BoundComponent<Channel, Definition>
    } : object
)

export type EcsChannelBindingOptions = {
    context: Context
}

type RawComponentWriter = EcsTypeWriters | Ecs2DTypeWriters | Ecs3DTypeWriters

type ChannelMutationApi = {
    createEntity(): number
    hasRoot(pid: number): boolean
    removeEntity(pid: number): number
    addComponent(pid: number, component: IEntity): BoundEcsComponent
    addSpatialComponent(pid: number, component: IEntity): BoundEcsComponent
    removeComponent(componentOrNid: BoundEcsComponent | number): void
    getComponent(nid: number): BoundEcsComponent | undefined
    createComponentWriter(ntype: number, schema: Schema): RawComponentWriter
    appendBoundComponentProp(component: BoundEcsComponent, prop: SchemaProp, value: any): void
    appendBoundComponentGroup(component: BoundEcsComponent, ntype: number, group: SchemaUpdateGroup, values: any[]): void
    hasSpatialComponent?(pid: number): boolean
}

type ComponentRecord = {
    definition: ComponentDefinition<any>
    pid: number
}

export class EcsChannelBinding<Channel extends BoundEcsChannel> {
    readonly world: EcsWorld
    readonly channel: Channel
    readonly context: Context
    private readonly ownedPids = new Set<number>()
    private readonly componentRecords = new WeakMap<object, ComponentRecord>()
    private readonly componentsByPid = new Map<number, Set<object>>()
    private readonly definitions = new Map<number, { definition: ComponentDefinition<any>, binding: any }>()

    constructor(world: EcsWorld, channel: Channel, options: EcsChannelBindingOptions) {
        this.world = world
        this.channel = channel
        this.context = options.context
    }

    createEntity() {
        const api = this.channelApi()
        const pid = api.createEntity()

        try {
            if (this.world.hasEntity(pid)) {
                throw new Error(`Cannot bind ECS root ${pid}; the world already contains that pid.`)
            }
            this.world.createEntity(pid)
            this.ownedPids.add(pid)
            return pid
        } catch (error) {
            api.removeEntity(pid)
            throw error
        }
    }

    removeEntity(pid: Pid) {
        this.assertActiveRoot(pid)

        // The world must remove network components before the channel resets
        // their nids during unregisterEntity(). Local-only components are also
        // removed here, even though the channel never sees them.
        const components = this.world.componentsForEntity(pid)
        this.world.removeEntity(pid)
        this.channelApi().removeEntity(pid)

        this.ownedPids.delete(pid)
        for (const component of components) {
            if (this.componentRecords.has(component)) {
                this.unregisterComponent(component, pid)
            }
        }
    }

    component<Definition extends ComponentDefinition<any>>(
        definition: Definition
    ): EcsBoundComponentBinding<Channel, Definition> {
        this.assertNetworkDefinition(definition)

        const existing = this.definitions.get(definition.ntype)
        if (existing) {
            if (existing.definition !== definition) {
                throw new Error(`ECS component type ${definition.ntype} is already bound to another definition.`)
            }
            return existing.binding
        }

        const schema = this.context.getSchema(definition.ntype)
        const rawWriter = this.channelApi().createComponentWriter(definition.ntype, schema)
        const binding = this.createComponentBinding(definition, schema, rawWriter)
        this.definitions.set(definition.ntype, { definition, binding })
        return binding
    }

    private createComponentBinding<Definition extends ComponentDefinition<any>>(
        definition: Definition,
        schema: Schema,
        rawWriter: RawComponentWriter
    ): EcsBoundComponentBinding<Channel, Definition> {
        type ComponentType = BoundComponent<Channel, Definition>

        const writerProps = Object.create(null) as Record<string, (component: ComponentType, value: any) => void>
        const mutateProps = Object.create(null) as Record<string, (component: ComponentType, value: any) => void>
        const writer: EcsBoundWriter<ComponentType, Definition> = {
            props: writerProps as EcsBoundWriter<ComponentType, Definition>['props'],
            groups: Object.create(null)
        }
        const mutate: EcsBoundMutators<Channel, Definition> = {
            props: mutateProps as EcsBoundMutators<Channel, Definition>['props'],
            groups: Object.create(null),
            patch: (component, values) => this.mutatePatch(definition, schema, component, values)
        }

        for (const name of Object.keys(schema.props)) {
            const rawPropWriter = rawWriter.props[name]
            if (typeof rawPropWriter !== 'function') {
                throw new Error(`ECS component writer is missing property ${name} for type ${definition.ntype}.`)
            }

            writerProps[name] = (component, value) => {
                this.assertWritableComponent(definition, component)
                rawPropWriter(component, value)
            }
            mutateProps[name] = (component, value) => {
                this.mutatePatch(definition, schema, component, { [name]: value } as Partial<EcsNetworkComponentState<Definition>>)
            }
        }

        for (const group of schema.updateGroups) {
            const rawGroupWriter = rawWriter.groups[group.name]
            if (typeof rawGroupWriter !== 'function') {
                throw new Error(`ECS component writer is missing update group ${group.name} for type ${definition.ntype}.`)
            }

            writer.groups[group.name] = (component, ...values) => {
                this.assertWritableComponent(definition, component)
                rawGroupWriter(component, ...values)
            }
            mutate.groups[group.name] = (component, ...values) => {
                this.mutateGroup(definition, schema, component, group, values)
            }
        }

        const binding: EcsBoundComponentBindingBase<Channel, Definition> = {
            definition,
            writer,
            mutate,
            add: (pid, state) => this.addComponent(definition, pid, state, false),
            remove: componentOrPid => this.removeComponent(definition, componentOrPid)
        }

        if (this.isSpatialChannel()) {
            const spatialBinding = binding as EcsBoundComponentBindingBase<Channel, Definition> & {
                addSpatial(pid: Pid, state: EcsNetworkComponentState<Definition>): ComponentType
            }
            spatialBinding.addSpatial = (pid, state) => this.addComponent(definition, pid, state, true)
            return spatialBinding as unknown as EcsBoundComponentBinding<Channel, Definition>
        }

        return binding as EcsBoundComponentBinding<Channel, Definition>
    }

    private addComponent<Definition extends ComponentDefinition<any>>(
        definition: Definition,
        pid: Pid,
        state: EcsNetworkComponentState<Definition>,
        spatial: boolean
    ): BoundComponent<Channel, Definition> {
        this.assertActiveRoot(pid)
        if (this.world.has(pid, definition)) {
            throw new Error(`Entity ${pid} already has component ${definition.ntype}.`)
        }
        if (spatial && !this.isSpatialChannel()) {
            throw new Error('Cannot add a spatial ECS component to a non-spatial ECS channel.')
        }

        const input = state as Record<string, any>
        for (const metadata of ['pid', 'nid', 'ntype']) {
            if (Object.prototype.hasOwnProperty.call(input, metadata)) {
                throw new Error(`Network component state must not provide ${metadata}.`)
            }
        }

        const component = definition.create({
            ...input,
            pid,
            nid: 0
        } as any) as BoundComponent<Channel, Definition>
        component.pid = pid
        component.nid = 0
        if (component.ntype !== definition.ntype) {
            throw new Error(`ECS component definition ${definition.ntype} created ntype ${component.ntype}.`)
        }

        const api = this.channelApi()
        try {
            const networked = spatial ? api.addSpatialComponent(pid, component) : api.addComponent(pid, component)
            const stored = this.world.add(networked as ComponentTypeForWorld<Definition>) as BoundComponent<Channel, Definition>
            this.registerComponent(stored, definition, pid)
            return stored
        } catch (error) {
            if (component.nid !== 0 && api.getComponent(component.nid) === component) {
                api.removeComponent(component.nid)
            }
            throw error
        }
    }

    private removeComponent<Definition extends ComponentDefinition<any>>(
        definition: Definition,
        componentOrPid: BoundComponent<Channel, Definition> | Pid
    ) {
        const component = typeof componentOrPid === 'number' ?
            this.world.get(componentOrPid, definition) as BoundComponent<Channel, Definition> | undefined :
            componentOrPid
        if (!component) {
            throw new Error(`Entity ${typeof componentOrPid === 'number' ? componentOrPid : componentOrPid.pid} is missing component ${definition.ntype}.`)
        }

        this.assertWritableComponent(definition, component)
        const pid = component.pid
        this.world.removeComponent(pid, definition)
        this.channelApi().removeComponent(component.nid)
        this.unregisterComponent(component, pid)
    }

    private mutatePatch<Definition extends ComponentDefinition<any>>(
        definition: Definition,
        schema: Schema,
        component: BoundComponent<Channel, Definition>,
        values: Partial<EcsNetworkComponentState<Definition>>
    ) {
        this.assertWritableComponent(definition, component)
        const entries = Object.keys(values as object).map(name => {
            const prop = schema.props[name]
            if (!prop) {
                throw new Error(`Property ${name} is not in ECS component schema ${definition.ntype}.`)
            }
            return { name, prop, value: (values as Record<string, any>)[name] }
        })

        const previous = entries.map(entry => ({ name: entry.name, value: component[entry.name] }))
        for (const entry of entries) {
            component[entry.name] = entry.value
        }

        try {
            for (const entry of entries) {
                this.channelApi().appendBoundComponentProp(component, entry.prop, entry.value)
            }
        } catch (error) {
            for (const entry of previous) {
                component[entry.name] = entry.value
            }
            throw error
        }
    }

    private mutateGroup<Definition extends ComponentDefinition<any>>(
        definition: Definition,
        schema: Schema,
        component: BoundComponent<Channel, Definition>,
        group: SchemaUpdateGroup,
        values: any[]
    ) {
        this.assertWritableComponent(definition, component)
        if (values.length !== group.props.length) {
            throw new Error(`ECS update group ${group.name} expects ${group.props.length} values, received ${values.length}.`)
        }
        if (schema.updateGroups.indexOf(group) === -1) {
            throw new Error(`ECS update group ${group.name} is not registered for component ${definition.ntype}.`)
        }

        const previous = group.props.map((prop, index) => ({
            name: prop.prop,
            value: component[prop.prop],
            next: values[index]
        }))
        for (const entry of previous) {
            component[entry.name] = entry.next
        }

        try {
            this.channelApi().appendBoundComponentGroup(component, definition.ntype, group, values)
        } catch (error) {
            for (const entry of previous) {
                component[entry.name] = entry.value
            }
            throw error
        }
    }

    private assertNetworkDefinition(definition: ComponentDefinition<any>) {
        if (!Number.isSafeInteger(definition.ntype) || definition.ntype <= 0) {
            throw new Error(`ECS component type ${definition.ntype} is local-only and cannot be bound to a network channel.`)
        }
    }

    private assertActiveRoot(pid: number) {
        const owned = this.ownedPids.has(pid)
        const world = this.world.hasEntity(pid)
        const channel = this.channelApi().hasRoot(pid)
        if (!owned || !world || !channel) {
            throw new Error(
                `ECS channel binding invariant failed for root ${pid}: owned=${owned}, world=${world}, channel=${channel}.`
            )
        }
    }

    private assertWritableComponent<Definition extends ComponentDefinition<any>>(
        definition: Definition,
        component: BoundComponent<Channel, Definition>
    ) {
        if (!component || typeof component !== 'object') {
            throw new Error(`Cannot mutate ECS component type ${definition.ntype}; target is not an object.`)
        }
        const record = this.componentRecords.get(component)
        if (!record || record.definition !== definition || record.pid !== component.pid) {
            throw new Error(`ECS component type ${definition.ntype} is not owned by this channel binding.`)
        }
        this.assertActiveRoot(component.pid)
        if (this.world.get(component.pid, definition) !== component) {
            throw new Error(`ECS component type ${definition.ntype} is not active in the world.`)
        }
        if (component.nid === 0 || this.channelApi().getComponent(component.nid) !== component) {
            throw new Error(`ECS component type ${definition.ntype} is not active in the channel.`)
        }
        if (this.isSpatialChannel() && !this.channelApi().hasSpatialComponent?.(component.pid)) {
            throw new Error(`ECS root ${component.pid} has no spatial component.`)
        }
    }

    private registerComponent(component: object, definition: ComponentDefinition<any>, pid: number) {
        this.componentRecords.set(component, { definition, pid })
        let components = this.componentsByPid.get(pid)
        if (!components) {
            components = new Set()
            this.componentsByPid.set(pid, components)
        }
        components.add(component)
    }

    private unregisterComponent(component: object, pid: number) {
        this.componentRecords.delete(component)
        const components = this.componentsByPid.get(pid)
        if (!components) {
            return
        }
        components.delete(component)
        if (components.size === 0) {
            this.componentsByPid.delete(pid)
        }
    }

    private isSpatialChannel(): this is EcsChannelBinding<Extract<Channel, SpatialEcsChannel>> {
        return this.channel instanceof EcsChannel2D || this.channel instanceof EcsChannel3D
    }

    private channelApi() {
        return this.channel as unknown as ChannelMutationApi
    }
}

type ComponentTypeForWorld<Definition extends ComponentDefinition<any>> =
    ComponentOf<Definition> & Component

export function bindEcsChannel<Channel extends BoundEcsChannel>(
    world: EcsWorld,
    channel: Channel,
    options: EcsChannelBindingOptions
) {
    return new EcsChannelBinding(world, channel, options)
}
