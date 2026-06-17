export type Pid = number
export type ComponentNid = number
export type ComponentType = number

export type EcsWorldComponent = {
    ntype: ComponentType
}

export type NetworkComponent = EcsWorldComponent & {
    nid: ComponentNid
    pid: Pid
}

export type ComponentCtor<T extends EcsWorldComponent> = {
    readonly ntype: ComponentType
    new (...args: any[]): T
}

export function componentType<T extends EcsWorldComponent>(ntype: ComponentType): ComponentCtor<T> {
    return { ntype } as ComponentCtor<T>
}

export type LocalComponent<T extends object> = T & EcsWorldComponent

export type LocalComponentCtor<T extends object> = ComponentCtor<LocalComponent<T>> & {
    readonly debugName?: string
    create(state: T): LocalComponent<T>
}

let nextGeneratedLocalComponentType = -1

export function localComponentType<T extends object>(debugName?: string): LocalComponentCtor<T> {
    const type = {
        ntype: nextGeneratedLocalComponentType--,
        debugName,
        create(state: T) {
            return Object.assign(state, { ntype: type.ntype }) as LocalComponent<T>
        }
    }
    return type as LocalComponentCtor<T>
}

export type MonoCtor<T> = {
    new (...args: any[]): T
}

export type ComponentInstances<Ctors extends readonly ComponentCtor<any>[]> = {
    [K in keyof Ctors]: Ctors[K] extends ComponentCtor<infer C> ? C : never
}

export type QueryEach<Ctors extends readonly ComponentCtor<any>[]> = (
    pid: Pid,
    ...components: ComponentInstances<Ctors>
) => void

export type QueryComponentEach<Ctors extends readonly ComponentCtor<any>[]> = (
    ...components: ComponentInstances<Ctors>
) => void

export type ComponentWriter<C extends NetworkComponent = NetworkComponent> = {
    readonly props: Record<string, (component: C, value: any) => void>
    readonly groups: Record<string, (component: C, ...values: any[]) => void>
}

export type ReadWorld = Pick<
    EcsWorld,
    | 'get'
    | 'getC'
    | 'getByNid'
    | 'has'
    | 'hasAll'
    | 'queryPids'
    | 'queryInto'
    | 'queryTypes'
    | 'read'
    | 'read2'
    | 'read3'
    | 'resource'
    | 'getResource'
    | 'hasResource'
>

export type EcsSystem<W = EcsWorld> = {
    readonly name: string
    readonly mode: 'read' | 'write'
    run(world: W, dtMs: number): void
}

export type EcsNetworkChannel = {
    createEntity(): Pid
    removeEntity(pid: Pid): number
    addComponent<T extends { nid: number, ntype: number }>(pid: Pid, component: T): T & NetworkComponent
    removeComponent(componentOrNid: NetworkComponent | ComponentNid): void
}

export type EcsSpatialNetworkChannel = EcsNetworkChannel & {
    addSpatialComponent<T extends { nid: number, ntype: number }>(pid: Pid, component: T): T & NetworkComponent
    updateSpatialComponent(componentOrNid: NetworkComponent | ComponentNid): void
}

type ComponentRecord = {
    component: EcsWorldComponent
    networked: boolean
}

export class EcsWorld {
    private channel?: EcsNetworkChannel
    private nextLocalPid: Pid
    private nextLocalComponentNid: ComponentNid
    private componentsByRoot = new Map<Pid, Map<ComponentType, ComponentRecord>>()
    private componentsByNid = new Map<ComponentNid, NetworkComponent>()
    private rootsByType = new Map<ComponentType, Set<Pid>>()
    private writersByType = new Map<ComponentType, ComponentWriter<any>>()
    private resourcesByCtor = new Map<MonoCtor<any>, any>()
    private queries = new Set<EcsQuery<readonly ComponentCtor<any>[]>>()
    private touchedRoots = new Set<Pid>()

    constructor(options: {
        channel?: EcsNetworkChannel
        localPidStart?: number
        localComponentNidStart?: number
    } = {}) {
        this.channel = options.channel
        this.nextLocalPid = options.localPidStart ?? -1
        this.nextLocalComponentNid = options.localComponentNidStart ?? -1
    }

    setNetworkChannel(channel: EcsNetworkChannel) {
        this.channel = channel
        return this
    }

    registerWriter<C extends NetworkComponent>(
        type: ComponentType | ComponentCtor<C>,
        writer: ComponentWriter<C>
    ) {
        const ntype = typeof type === 'number' ? type : type.ntype
        this.writersByType.set(ntype, writer)
        this.ensureType(ntype)
        return writer
    }

    resource<T>(ctor: MonoCtor<T>, create?: () => T): T {
        if (this.resourcesByCtor.has(ctor)) {
            return this.resourcesByCtor.get(ctor)
        }

        const value = create ? create() : new ctor()
        this.resourcesByCtor.set(ctor, value)
        return value
    }

    getResource<T>(ctor: MonoCtor<T>): T | undefined {
        return this.resourcesByCtor.get(ctor)
    }

    setResource<T>(ctor: MonoCtor<T>, value: T) {
        this.resourcesByCtor.set(ctor, value)
        return value
    }

    hasResource<T>(ctor: MonoCtor<T>) {
        return this.resourcesByCtor.has(ctor)
    }

    removeResource<T>(ctor: MonoCtor<T>) {
        return this.resourcesByCtor.delete(ctor)
    }

    mono<T>(ctor: MonoCtor<T>, create?: () => T): T {
        return this.resource(ctor, create)
    }

    getMono<T>(ctor: MonoCtor<T>): T | undefined {
        return this.getResource(ctor)
    }

    setMono<T>(ctor: MonoCtor<T>, value: T) {
        return this.setResource(ctor, value)
    }

    hasMono<T>(ctor: MonoCtor<T>) {
        return this.hasResource(ctor)
    }

    removeMono<T>(ctor: MonoCtor<T>) {
        return this.removeResource(ctor)
    }

    query<const Ctors extends readonly ComponentCtor<any>[]>(
        name: string,
        ...ctors: Ctors
    ): EcsQuery<Ctors> {
        const query = new EcsQuery(name, this, ctors)
        this.queries.add(query as EcsQuery<readonly ComponentCtor<any>[]>)
        query.refreshAll()
        return query
    }

    flushQueries() {
        if (this.touchedRoots.size === 0) {
            return
        }
        const touched = Array.from(this.touchedRoots)
        this.touchedRoots.clear()
        for (const query of this.queries) {
            query.refresh(touched)
        }
    }

    refreshQueries() {
        this.touchedRoots.clear()
        for (const query of this.queries) {
            query.refreshAll()
        }
    }

    createEntity(options: { networked?: boolean } = {}) {
        const pid = options.networked ? this.requireChannel().createEntity() : this.nextLocalPid--
        this.componentsByRoot.set(pid, new Map())
        this.markRootTouched(pid)
        return pid
    }

    createLocalEntity() {
        return this.createEntity()
    }

    createNetworkEntity() {
        return this.createEntity({ networked: true })
    }

    removeEntity(pid: Pid) {
        const records = this.componentsByRoot.get(pid)
        if (!records) {
            return false
        }
        this.markRootTouched(pid)

        for (const [ntype, record] of records) {
            this.rootsByType.get(ntype)?.delete(pid)
            const component = record.component as Partial<NetworkComponent>
            if (record.networked && component.nid !== undefined) {
                this.componentsByNid.delete(component.nid)
            }
        }

        this.componentsByRoot.delete(pid)
        if (this.channel && this.isNetworkId(pid)) {
            this.channel.removeEntity(pid)
        }
        return true
    }

    addLocalComponent<T extends EcsWorldComponent>(pid: Pid, component: T): T {
        const local = component as T & Partial<NetworkComponent>
        local.pid = pid
        if (local.nid === undefined) {
            local.nid = this.nextLocalComponentNid--
        }
        this.addRecord(pid, local, false)
        return component
    }

    addNetworkComponent<T extends { nid: number, ntype: number }>(pid: Pid, component: T): T & NetworkComponent {
        const added = this.requireChannel().addComponent(pid, component)
        this.addRecord(pid, added, true)
        this.componentsByNid.set(added.nid, added)
        return added
    }

    addSpatialComponent<T extends { nid: number, ntype: number }>(pid: Pid, component: T): T & NetworkComponent {
        const channel = this.requireSpatialChannel()
        const added = channel.addSpatialComponent(pid, component)
        this.addRecord(pid, added, true)
        this.componentsByNid.set(added.nid, added)
        return added
    }

    removeComponent(pid: Pid, ntype: ComponentType) {
        const records = this.componentsByRoot.get(pid)
        const record = records?.get(ntype)
        if (!records || !record) {
            return false
        }

        records.delete(ntype)
        this.rootsByType.get(ntype)?.delete(pid)
        this.markRootTouched(pid)

        const component = record.component as Partial<NetworkComponent>
        if (record.networked && component.nid !== undefined) {
            this.componentsByNid.delete(component.nid)
            this.channel?.removeComponent(component.nid)
        }
        return true
    }

    get<T extends EcsWorldComponent>(pid: Pid, ctor: ComponentCtor<T>): T | undefined {
        return this.componentsByRoot.get(pid)?.get(ctor.ntype)?.component as T | undefined
    }

    c<T extends EcsWorldComponent>(pid: Pid, ctor: ComponentCtor<T>): T {
        return this.component(pid, ctor)
    }

    component<T extends EcsWorldComponent>(pid: Pid, ctor: ComponentCtor<T>): T {
        const component = this.get(pid, ctor)
        if (!component) {
            throw new Error(`Entity ${pid} does not have component type ${ctor.ntype}.`)
        }
        return component
    }

    require<T extends EcsWorldComponent>(pid: Pid, ctor: ComponentCtor<T>): T {
        return this.component(pid, ctor)
    }

    getC<T extends EcsWorldComponent>(pid: Pid, ntype: ComponentType): T | undefined {
        return this.componentsByRoot.get(pid)?.get(ntype)?.component as T | undefined
    }

    getByType<T extends EcsWorldComponent>(pid: Pid, ntype: ComponentType): T | undefined {
        return this.getC<T>(pid, ntype)
    }

    requireC<T extends EcsWorldComponent>(pid: Pid, ntype: ComponentType): T {
        const component = this.getC<T>(pid, ntype)
        if (!component) {
            throw new Error(`Entity ${pid} does not have component type ${ntype}.`)
        }
        return component
    }

    getByNid<T extends NetworkComponent = NetworkComponent>(nid: ComponentNid): T | undefined {
        return this.componentsByNid.get(nid) as T | undefined
    }

    has(pid: Pid, ntype: ComponentType) {
        return this.componentsByRoot.get(pid)?.has(ntype) ?? false
    }

    hasAll(pid: Pid, ...types: ComponentType[]) {
        const records = this.componentsByRoot.get(pid)
        if (!records) {
            return false
        }
        for (let i = 0; i < types.length; i++) {
            if (!records.has(types[i])) {
                return false
            }
        }
        return true
    }

    queryPids(...types: ComponentType[]) {
        if (types.length === 0) {
            return Array.from(this.componentsByRoot.keys())
        }

        const smallest = this.findSmallestRootSet(types)
        if (!smallest) {
            return []
        }

        const out: Pid[] = []
        this.collectQuery(types, smallest, out)
        return out
    }

    queryInto(types: ComponentType[], out: Pid[]) {
        out.length = 0
        if (types.length === 0) {
            for (const pid of this.componentsByRoot.keys()) {
                out.push(pid)
            }
            return out
        }

        const smallest = this.findSmallestRootSet(types)
        if (smallest) {
            this.collectQuery(types, smallest, out)
        }
        return out
    }

    query2<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent>(
        c0: ComponentCtor<T0>,
        c1: ComponentCtor<T1>
    ) {
        const pids = this.queryPids(c0.ntype, c1.ntype)
        const rows: Array<[Pid, T0, T1]> = []
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i]
            rows.push([pid, this.component(pid, c0), this.component(pid, c1)])
        }
        return rows
    }

    forEach2<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent>(
        c0: ComponentCtor<T0>,
        c1: ComponentCtor<T1>,
        fn: (pid: Pid, c0: T0, c1: T1) => void
    ) {
        const pids = this.queryPids(c0.ntype, c1.ntype)
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i]
            fn(pid, this.component(pid, c0), this.component(pid, c1))
        }
    }

    forEach3<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent, T2 extends EcsWorldComponent>(
        c0: ComponentCtor<T0>,
        c1: ComponentCtor<T1>,
        c2: ComponentCtor<T2>,
        fn: (pid: Pid, c0: T0, c1: T1, c2: T2) => void
    ) {
        const pids = this.queryPids(c0.ntype, c1.ntype, c2.ntype)
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i]
            fn(pid, this.component(pid, c0), this.component(pid, c1), this.component(pid, c2))
        }
    }

    queryTypes(...ctors: ComponentCtor<EcsWorldComponent>[]) {
        const types = new Array<ComponentType>(ctors.length)
        for (let i = 0; i < ctors.length; i++) {
            types[i] = ctors[i].ntype
        }
        return this.queryPids(...types)
    }

    forEach<T extends EcsWorldComponent>(ctor: ComponentCtor<T>, fn: (pid: Pid, component: T) => void) {
        const roots = this.rootsByType.get(ctor.ntype)
        if (!roots) {
            return
        }
        for (const pid of roots) {
            const component = this.get(pid, ctor)
            if (component) {
                fn(pid, component)
            }
        }
    }

    read<T extends EcsWorldComponent>(
        ctor: ComponentCtor<T>,
        fn: (pid: Pid, component: Readonly<T>) => void
    ) {
        this.forEach(ctor, fn as (pid: Pid, component: T) => void)
    }

    read2<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent>(
        c0: ComponentCtor<T0>,
        c1: ComponentCtor<T1>,
        fn: (pid: Pid, c0: Readonly<T0>, c1: Readonly<T1>) => void
    ) {
        this.forEach2(c0, c1, fn as (pid: Pid, c0: T0, c1: T1) => void)
    }

    read3<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent, T2 extends EcsWorldComponent>(
        c0: ComponentCtor<T0>,
        c1: ComponentCtor<T1>,
        c2: ComponentCtor<T2>,
        fn: (pid: Pid, c0: Readonly<T0>, c1: Readonly<T1>, c2: Readonly<T2>) => void
    ) {
        this.forEach3(c0, c1, c2, fn as (pid: Pid, c0: T0, c1: T1, c2: T2) => void)
    }

    write<T extends EcsWorldComponent>(
        ctor: ComponentCtor<T>,
        fn: (pid: Pid, component: T) => void
    ) {
        this.forEach(ctor, fn)
    }

    write2<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent>(
        c0: ComponentCtor<T0>,
        c1: ComponentCtor<T1>,
        fn: (pid: Pid, c0: T0, c1: T1) => void
    ) {
        this.forEach2(c0, c1, fn)
    }

    write3<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent, T2 extends EcsWorldComponent>(
        c0: ComponentCtor<T0>,
        c1: ComponentCtor<T1>,
        c2: ComponentCtor<T2>,
        fn: (pid: Pid, c0: T0, c1: T1, c2: T2) => void
    ) {
        this.forEach3(c0, c1, c2, fn)
    }

    set<C extends NetworkComponent, K extends keyof C & string>(component: C, prop: K, value: C[K]) {
        component[prop] = value
        this.writersByType.get(component.ntype)?.props[prop]?.(component, value)
    }

    group<C extends NetworkComponent>(component: C, groupName: string, ...values: any[]) {
        const writer = this.writersByType.get(component.ntype)
        if (!writer) {
            throw new Error(`No ECS writer registered for component type ${component.ntype}.`)
        }
        const group = writer.groups[groupName]
        if (!group) {
            throw new Error(`No ECS group writer '${groupName}' for component type ${component.ntype}.`)
        }
        group(component, ...values)
    }

    componentTypes(pid: Pid) {
        return Array.from(this.componentsByRoot.get(pid)?.keys() ?? [])
    }

    components(pid: Pid) {
        const records = this.componentsByRoot.get(pid)
        if (!records) {
            return []
        }
        const components: EcsWorldComponent[] = []
        for (const record of records.values()) {
            components.push(record.component)
        }
        return components
    }

    rootsWith(ntype: ComponentType) {
        return Array.from(this.rootsByType.get(ntype) ?? [])
    }

    isNetworkedComponent(pid: Pid, ntype: ComponentType) {
        return this.componentsByRoot.get(pid)?.get(ntype)?.networked ?? false
    }

    isLocalId(id: number) {
        return id < 0
    }

    isNetworkId(id: number) {
        return id > 0
    }

    countEntities() {
        return this.componentsByRoot.size
    }

    countComponents(ntype?: ComponentType) {
        if (ntype !== undefined) {
            return this.rootsByType.get(ntype)?.size ?? 0
        }
        let count = 0
        for (const records of this.componentsByRoot.values()) {
            count += records.size
        }
        return count
    }

    debugStats() {
        return {
            entities: this.countEntities(),
            components: this.countComponents(),
            componentTypes: this.rootsByType.size,
            networkComponents: this.componentsByNid.size,
            resources: this.resourcesByCtor.size,
            queries: this.queries.size
        }
    }

    private addRecord(pid: Pid, component: EcsWorldComponent, networked: boolean) {
        const records = this.componentsByRoot.get(pid)
        if (!records) {
            throw new Error(`Cannot add component to unknown ECS entity ${pid}.`)
        }

        const existing = records.get(component.ntype)
        if (existing) {
            const existingNetwork = existing.component as Partial<NetworkComponent>
            if (existing.networked && existingNetwork.nid !== undefined) {
                this.componentsByNid.delete(existingNetwork.nid)
            }
        }

        records.set(component.ntype, { component, networked })
        this.ensureType(component.ntype)
        this.rootsByType.get(component.ntype)!.add(pid)
        this.markRootTouched(pid)
    }

    private ensureType(ntype: ComponentType) {
        if (!this.rootsByType.has(ntype)) {
            this.rootsByType.set(ntype, new Set())
        }
    }

    private findSmallestRootSet(types: ComponentType[]) {
        let smallest: Set<Pid> | undefined
        for (let i = 0; i < types.length; i++) {
            const roots = this.rootsByType.get(types[i])
            if (!roots) {
                return undefined
            }
            if (!smallest || roots.size < smallest.size) {
                smallest = roots
            }
        }
        return smallest
    }

    private collectQuery(types: ComponentType[], candidates: Set<Pid>, out: Pid[]) {
        outer:
        for (const pid of candidates) {
            const records = this.componentsByRoot.get(pid)
            if (!records) {
                continue
            }
            for (let i = 0; i < types.length; i++) {
                if (!records.has(types[i])) {
                    continue outer
                }
            }
            out.push(pid)
        }
    }

    private markRootTouched(pid: Pid) {
        this.touchedRoots.add(pid)
    }

    private requireChannel() {
        if (!this.channel) {
            throw new Error('This EcsWorld was not constructed with a nengi ECS channel.')
        }
        return this.channel
    }

    private requireSpatialChannel() {
        const channel = this.requireChannel()
        if (!('addSpatialComponent' in channel)) {
            throw new Error('This EcsWorld channel is not spatial.')
        }
        return channel as EcsSpatialNetworkChannel
    }
}

export class EcsQuery<Ctors extends readonly ComponentCtor<any>[]> {
    readonly ntypes: ComponentType[]
    private matchingRoots = new Set<Pid>()
    private enterHandlers: QueryEach<Ctors>[] = []
    private exitHandlers: Array<(pid: Pid) => void> = []

    constructor(
        readonly name: string,
        private world: EcsWorld,
        private ctors: Ctors
    ) {
        this.ntypes = new Array<ComponentType>(ctors.length)
        for (let i = 0; i < ctors.length; i++) {
            this.ntypes[i] = ctors[i].ntype
        }
    }

    onEnter(fn: QueryEach<Ctors>, options: { includeExisting?: boolean } = {}) {
        this.enterHandlers.push(fn)
        if (options.includeExisting) {
            this.each(fn)
        }
        return this
    }

    onExit(fn: (pid: Pid) => void) {
        this.exitHandlers.push(fn)
        return this
    }

    each(fn: QueryEach<Ctors>) {
        for (const pid of this.matchingRoots) {
            const components = this.collectComponents(pid)
            if (components) {
                fn(pid, ...components)
            }
        }
    }

    eachComponents(fn: QueryComponentEach<Ctors>) {
        for (const pid of this.matchingRoots) {
            const components = this.collectComponents(pid)
            if (components) {
                fn(...components)
            }
        }
    }

    has(pid: Pid) {
        return this.matchingRoots.has(pid)
    }

    roots() {
        return Array.from(this.matchingRoots)
    }

    size() {
        return this.matchingRoots.size
    }

    refresh(pids: Iterable<Pid>) {
        for (const pid of pids) {
            this.refreshRoot(pid)
        }
    }

    refreshOne(pid: Pid) {
        this.refreshRoot(pid)
    }

    refreshAll() {
        const candidates = new Set<Pid>(this.matchingRoots)
        const matches = this.world.queryPids(...this.ntypes)
        for (let i = 0; i < matches.length; i++) {
            candidates.add(matches[i])
        }
        this.refresh(candidates)
    }

    private refreshRoot(pid: Pid) {
        const had = this.matchingRoots.has(pid)
        const has = this.world.hasAll(pid, ...this.ntypes)

        if (!had && has) {
            const components = this.collectComponents(pid)
            if (!components) {
                return
            }
            this.matchingRoots.add(pid)
            for (let i = 0; i < this.enterHandlers.length; i++) {
                this.enterHandlers[i](pid, ...components)
            }
            return
        }

        if (had && !has) {
            this.matchingRoots.delete(pid)
            for (let i = 0; i < this.exitHandlers.length; i++) {
                this.exitHandlers[i](pid)
            }
        }
    }

    private collectComponents(pid: Pid): ComponentInstances<Ctors> | undefined {
        const components = new Array(this.ctors.length)
        for (let i = 0; i < this.ctors.length; i++) {
            const component = this.world.get(pid, this.ctors[i])
            if (!component) {
                return undefined
            }
            components[i] = component
        }
        return components as ComponentInstances<Ctors>
    }
}

export function readSystem(name: string, run: (world: ReadWorld, dtMs: number) => void): EcsSystem<ReadWorld> {
    return { name, mode: 'read', run }
}

export function writeSystem(name: string, run: (world: EcsWorld, dtMs: number) => void): EcsSystem {
    return { name, mode: 'write', run }
}

export function runSystems(world: EcsWorld, systems: readonly EcsSystem<any>[], dtMs: number) {
    for (let i = 0; i < systems.length; i++) {
        systems[i].run(world, dtMs)
    }
}
