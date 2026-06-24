export type Pid = number
export type Nid = number
export type ComponentTypeId = number

export type Component = {
    pid: Pid
    ntype: ComponentTypeId
    nid?: Nid
}

export type NetworkComponent = Component & {
    nid: Nid
}

export type IdentifiedComponent = Component & {
    nid: Nid
}

export type ComponentDefinition<T extends { ntype: number }> = {
    readonly ntype: T['ntype']
    readonly debugName?: string
    create(state: Omit<T, 'ntype'>): T
}

export type ComponentOf<Def> = Def extends ComponentDefinition<infer T> ? T & Component : never

export type QueryComponents<Defs extends readonly ComponentDefinition<any>[]> = {
    [K in keyof Defs]: ComponentOf<Defs[K]>
}

export type Query<Defs extends readonly ComponentDefinition<any>[]> = {
    all(fn: (pid: Pid, ...components: QueryComponents<Defs>) => void): void
    pids(out?: Pid[]): Pid[]
}

type ComponentStore = Map<Pid, Component>

let nextLocalComponentType = -1

export function defineComponent<T extends { ntype: number }>(ntype: number, debugName?: string): ComponentDefinition<T> {
    return {
        ntype: ntype as T['ntype'],
        debugName,
        create(state: Omit<T, 'ntype'>) {
            return { ...state, ntype } as T
        }
    }
}

export function defineLocalComponent<T extends object>(debugName?: string): ComponentDefinition<T & { ntype: number }> {
    const ntype = nextLocalComponentType--
    return defineComponent<T & { ntype: number }>(ntype, debugName)
}

export class EcsWorld {
    // Mirrors nengi: entity ids and component nids come from one id pool.
    private nextLocalId = -1
    private entities = new Set<Pid>()
    private byPid = new Map<Pid, Map<ComponentTypeId, Component>>()
    private byType = new Map<ComponentTypeId, ComponentStore>()
    private byNid = new Map<Nid, IdentifiedComponent>()
    private resources = new Map<any, any>()
    private cachedQueries = new Set<CachedQuery<readonly ComponentDefinition<any>[]>>
    private touchedPids = new Set<Pid>()

    createEntity(pid = this.nextId()) {
        if (!this.entities.has(pid) && this.byNid.has(pid)) {
            throw new Error(`ECS id ${pid} is already used by a component.`)
        }
        this.entities.add(pid)
        if (!this.byPid.has(pid)) {
            this.byPid.set(pid, new Map())
        }
        this.touch(pid)
        return pid
    }

    add<T extends Component>(component: T): T {
        if (this.byPid.get(component.pid)?.has(component.ntype)) {
            throw new Error(`Entity ${component.pid} already has component ${component.ntype}`)
        }
        if (component.nid === undefined) {
            component.nid = this.nextId()
        }
        if (component.nid !== 0) {
            if (component.nid === component.pid || this.entities.has(component.nid)) {
                throw new Error(`ECS id ${component.nid} is already used by an entity.`)
            }
            if (this.byNid.has(component.nid)) {
                throw new Error(`ECS id ${component.nid} is already used by a component.`)
            }
        }

        this.createEntity(component.pid)
        this.byPid.get(component.pid)!.set(component.ntype, component)
        this.typeStore(component.ntype).set(component.pid, component)
        if (component.nid !== 0) {
            this.byNid.set(component.nid, component as T & IdentifiedComponent)
        }
        this.touch(component.pid)
        return component
    }

    addLocalComponent<T extends { ntype: number }>(pid: Pid, component: T): T & Component {
        const stored = component as T & Component
        stored.pid = pid
        return this.add(stored)
    }

    removeComponentByNid(nid: Nid) {
        const component = this.byNid.get(nid)
        if (!component) {
            return undefined
        }
        this.byNid.delete(nid)
        this.byPid.get(component.pid)?.delete(component.ntype)
        this.byType.get(component.ntype)?.delete(component.pid)
        this.touch(component.pid)
        return component
    }

    removeComponent(pid: Pid, type: ComponentTypeId | ComponentDefinition<any>) {
        const ntype = typeId(type)
        const component = this.byPid.get(pid)?.get(ntype)
        if (!component) {
            return undefined
        }
        this.byPid.get(pid)?.delete(ntype)
        this.byType.get(ntype)?.delete(pid)
        if (component.nid !== undefined) {
            this.byNid.delete(component.nid)
        }
        this.touch(pid)
        return component
    }

    removeEntity(pid: Pid) {
        const components = this.byPid.get(pid)
        if (!components) {
            return []
        }

        const removed = Array.from(components.values())
        removed.forEach(component => {
            this.byType.get(component.ntype)?.delete(pid)
            if (component.nid !== undefined) {
                this.byNid.delete(component.nid)
            }
        })
        this.byPid.delete(pid)
        this.entities.delete(pid)
        this.touch(pid)
        return removed
    }

    get<T extends { ntype: number }>(pid: Pid, def: ComponentDefinition<T>) {
        return this.byPid.get(pid)?.get(def.ntype) as T & Component | undefined
    }

    require<T extends { ntype: number }>(pid: Pid, def: ComponentDefinition<T>) {
        const component = this.get(pid, def)
        if (!component) {
            throw new Error(`Entity ${pid} is missing ${def.debugName ?? def.ntype}`)
        }
        return component
    }

    getByNid<T extends IdentifiedComponent = IdentifiedComponent>(nid: Nid) {
        return this.byNid.get(nid) as T | undefined
    }

    componentOwner(nid: Nid) {
        return this.byNid.get(nid)?.pid
    }

    componentNtype(nid: Nid) {
        return this.byNid.get(nid)?.ntype
    }

    componentNidsForEntity(pid: Pid) {
        const components = this.byPid.get(pid)
        if (!components) {
            return []
        }
        const nids: Nid[] = []
        components.forEach(component => {
            if (component.nid !== undefined) {
                nids.push(component.nid)
            }
        })
        return nids
    }

    has(pid: Pid, type: ComponentTypeId | ComponentDefinition<any>) {
        return this.byPid.get(pid)?.has(typeId(type)) ?? false
    }

    query<const Defs extends readonly ComponentDefinition<any>[]>(...defs: Defs): Query<Defs> {
        return createQuery(this, defs)
    }

    cachedQuery<const Defs extends readonly ComponentDefinition<any>[]>(...defs: Defs): Query<Defs> {
        const query = new CachedQuery(this, defs)
        this.cachedQueries.add(query as CachedQuery<readonly ComponentDefinition<any>[]>)
        query.refreshAll()
        return query
    }

    flushQueries() {
        if (this.touchedPids.size === 0) {
            return
        }
        const pids = Array.from(this.touchedPids)
        this.touchedPids.clear()
        this.cachedQueries.forEach(query => query.refresh(pids))
    }

    resource<T>(key: ResourceKey<T>, create?: () => T): T {
        if (!this.resources.has(key)) {
            if (!create) {
                throw new Error(`Missing ECS resource: ${resourceName(key)}`)
            }
            this.resources.set(key, create())
        }
        return this.resources.get(key)
    }

    setResource<T>(key: ResourceKey<T>, value: T) {
        this.resources.set(key, value)
        return value
    }

    componentCount(type?: ComponentTypeId | ComponentDefinition<any>) {
        if (type === undefined) {
            return Array.from(this.byPid.values()).reduce((sum, components) => sum + components.size, 0)
        }
        return this.byType.get(typeId(type))?.size ?? 0
    }

    entityCount() {
        return this.entities.size
    }

    identifiedComponentCount() {
        return this.byNid.size
    }

    matchingPids(types: readonly ComponentTypeId[], out: Pid[] = []) {
        out.length = 0
        if (types.length === 0) {
            out.push(...this.entities)
            return out
        }

        const store = this.smallestStore(types)
        if (!store) {
            return out
        }

        store.forEach((_component, pid) => {
            if (this.hasAll(pid, types)) {
                out.push(pid)
            }
        })
        return out
    }

    componentsFor<Defs extends readonly ComponentDefinition<any>[]>(pid: Pid, defs: Defs) {
        const components = new Array(defs.length)
        for (let i = 0; i < defs.length; i++) {
            const component = this.byPid.get(pid)?.get(defs[i].ntype)
            if (!component) {
                return undefined
            }
            components[i] = component
        }
        return components as QueryComponents<Defs>
    }

    private typeStore(ntype: ComponentTypeId) {
        let store = this.byType.get(ntype)
        if (!store) {
            store = new Map()
            this.byType.set(ntype, store)
        }
        return store
    }

    private hasAll(pid: Pid, types: readonly ComponentTypeId[]) {
        const components = this.byPid.get(pid)
        if (!components) {
            return false
        }
        for (let i = 0; i < types.length; i++) {
            if (!components.has(types[i])) {
                return false
            }
        }
        return true
    }

    private smallestStore(types: readonly ComponentTypeId[]) {
        let smallest: ComponentStore | undefined
        for (let i = 0; i < types.length; i++) {
            const store = this.byType.get(types[i])
            if (!store) {
                return undefined
            }
            if (!smallest || store.size < smallest.size) {
                smallest = store
            }
        }
        return smallest
    }

    private touch(pid: Pid) {
        this.touchedPids.add(pid)
    }

    private nextId() {
        let id = this.nextLocalId--
        while (this.entities.has(id) || this.byNid.has(id)) {
            id = this.nextLocalId--
        }
        return id
    }
}

export type ResourceCtor<T> = abstract new (...args: any[]) => T

export type ResourceToken<T> = {
    name: string
    _type?: T
}

export type ResourceKey<T> = ResourceCtor<T> | ResourceToken<T>

export function defineResource<T>(name: string): ResourceToken<T> {
    return { name }
}

export const ecs = {
    defineComponent,
    defineLocalComponent,
    defineResource
}

function createQuery<const Defs extends readonly ComponentDefinition<any>[]>(
    ecs: EcsWorld,
    defs: Defs
): Query<Defs> {
    const types = defs.map(def => def.ntype)
    return {
        all(fn) {
            const pids = ecs.matchingPids(types)
            for (let i = 0; i < pids.length; i++) {
                const components = ecs.componentsFor(pids[i], defs)
                if (components) {
                    fn(pids[i], ...components)
                }
            }
        },
        pids(out) {
            return ecs.matchingPids(types, out)
        }
    }
}

class CachedQuery<Defs extends readonly ComponentDefinition<any>[]> implements Query<Defs> {
    private readonly types: ComponentTypeId[]
    private readonly matched = new Set<Pid>()
    private readonly pidsCache: Pid[] = []

    constructor(private readonly ecs: EcsWorld, private readonly defs: Defs) {
        this.types = defs.map(def => def.ntype)
    }

    all(fn: (pid: Pid, ...components: QueryComponents<Defs>) => void) {
        this.ecs.flushQueries()
        for (let i = 0; i < this.pidsCache.length; i++) {
            const pid = this.pidsCache[i]
            const components = this.ecs.componentsFor(pid, this.defs)
            if (components) {
                fn(pid, ...components)
            }
        }
    }

    pids(out: Pid[] = []) {
        this.ecs.flushQueries()
        out.length = 0
        out.push(...this.pidsCache)
        return out
    }

    refresh(pids: Pid[]) {
        let changed = false
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i]
            const matches = this.types.every(type => this.ecs.has(pid, type))
            if (matches && !this.matched.has(pid)) {
                this.matched.add(pid)
                changed = true
            } else if (!matches && this.matched.delete(pid)) {
                changed = true
            }
        }
        if (changed) {
            this.rebuildCache()
        }
    }

    refreshAll() {
        this.matched.clear()
        this.ecs.matchingPids(this.types).forEach(pid => this.matched.add(pid))
        this.rebuildCache()
    }

    private rebuildCache() {
        this.pidsCache.length = 0
        this.pidsCache.push(...this.matched)
    }
}

function typeId(type: ComponentTypeId | ComponentDefinition<any>) {
    return typeof type === 'number' ? type : type.ntype
}

function resourceName(key: ResourceKey<any>) {
    return typeof key === 'function' ? key.name : key.name
}
