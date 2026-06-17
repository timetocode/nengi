export type Pid = number;
export type ComponentNid = number;
export type ComponentType = number;
export type EcsWorldComponent = {
    ntype: ComponentType;
};
export type NetworkComponent = EcsWorldComponent & {
    nid: ComponentNid;
    pid: Pid;
};
export type ComponentCtor<T extends EcsWorldComponent> = {
    readonly ntype: ComponentType;
    new (...args: any[]): T;
};
export declare function componentType<T extends EcsWorldComponent>(ntype: ComponentType): ComponentCtor<T>;
export type LocalComponent<T extends object> = T & EcsWorldComponent;
export type LocalComponentCtor<T extends object> = ComponentCtor<LocalComponent<T>> & {
    readonly debugName?: string;
    create(state: T): LocalComponent<T>;
};
export declare function localComponentType<T extends object>(debugName?: string): LocalComponentCtor<T>;
export type MonoCtor<T> = {
    new (...args: any[]): T;
};
export type ComponentInstances<Ctors extends readonly ComponentCtor<any>[]> = {
    [K in keyof Ctors]: Ctors[K] extends ComponentCtor<infer C> ? C : never;
};
export type QueryEach<Ctors extends readonly ComponentCtor<any>[]> = (pid: Pid, ...components: ComponentInstances<Ctors>) => void;
export type QueryComponentEach<Ctors extends readonly ComponentCtor<any>[]> = (...components: ComponentInstances<Ctors>) => void;
export type ComponentWriter<C extends NetworkComponent = NetworkComponent> = {
    readonly props: Record<string, (component: C, value: any) => void>;
    readonly groups: Record<string, (component: C, ...values: any[]) => void>;
};
export type ReadWorld = Pick<EcsWorld, 'get' | 'getC' | 'getByNid' | 'has' | 'hasAll' | 'queryPids' | 'queryInto' | 'queryTypes' | 'read' | 'read2' | 'read3' | 'resource' | 'getResource' | 'hasResource'>;
export type EcsSystem<W = EcsWorld> = {
    readonly name: string;
    readonly mode: 'read' | 'write';
    run(world: W, dtMs: number): void;
};
export type EcsNetworkChannel = {
    createEntity(): Pid;
    removeEntity(pid: Pid): number;
    addComponent<T extends {
        nid: number;
        ntype: number;
    }>(pid: Pid, component: T): T & NetworkComponent;
    removeComponent(componentOrNid: NetworkComponent | ComponentNid): void;
};
export type EcsSpatialNetworkChannel = EcsNetworkChannel & {
    addSpatialComponent<T extends {
        nid: number;
        ntype: number;
    }>(pid: Pid, component: T): T & NetworkComponent;
    updateSpatialComponent(componentOrNid: NetworkComponent | ComponentNid): void;
};
export declare class EcsWorld {
    private channel?;
    private nextLocalPid;
    private nextLocalComponentNid;
    private componentsByRoot;
    private componentsByNid;
    private rootsByType;
    private writersByType;
    private resourcesByCtor;
    private queries;
    private touchedRoots;
    constructor(options?: {
        channel?: EcsNetworkChannel;
        localPidStart?: number;
        localComponentNidStart?: number;
    });
    setNetworkChannel(channel: EcsNetworkChannel): this;
    registerWriter<C extends NetworkComponent>(type: ComponentType | ComponentCtor<C>, writer: ComponentWriter<C>): ComponentWriter<C>;
    resource<T>(ctor: MonoCtor<T>, create?: () => T): T;
    getResource<T>(ctor: MonoCtor<T>): T | undefined;
    setResource<T>(ctor: MonoCtor<T>, value: T): T;
    hasResource<T>(ctor: MonoCtor<T>): boolean;
    removeResource<T>(ctor: MonoCtor<T>): boolean;
    mono<T>(ctor: MonoCtor<T>, create?: () => T): T;
    getMono<T>(ctor: MonoCtor<T>): T | undefined;
    setMono<T>(ctor: MonoCtor<T>, value: T): T;
    hasMono<T>(ctor: MonoCtor<T>): boolean;
    removeMono<T>(ctor: MonoCtor<T>): boolean;
    query<const Ctors extends readonly ComponentCtor<any>[]>(name: string, ...ctors: Ctors): EcsQuery<Ctors>;
    flushQueries(): void;
    refreshQueries(): void;
    createEntity(options?: {
        networked?: boolean;
    }): number;
    createLocalEntity(): number;
    createNetworkEntity(): number;
    removeEntity(pid: Pid): boolean;
    addLocalComponent<T extends EcsWorldComponent>(pid: Pid, component: T): T;
    addNetworkComponent<T extends {
        nid: number;
        ntype: number;
    }>(pid: Pid, component: T): T & NetworkComponent;
    addSpatialComponent<T extends {
        nid: number;
        ntype: number;
    }>(pid: Pid, component: T): T & NetworkComponent;
    removeComponent(pid: Pid, ntype: ComponentType): boolean;
    get<T extends EcsWorldComponent>(pid: Pid, ctor: ComponentCtor<T>): T | undefined;
    c<T extends EcsWorldComponent>(pid: Pid, ctor: ComponentCtor<T>): T;
    component<T extends EcsWorldComponent>(pid: Pid, ctor: ComponentCtor<T>): T;
    require<T extends EcsWorldComponent>(pid: Pid, ctor: ComponentCtor<T>): T;
    getC<T extends EcsWorldComponent>(pid: Pid, ntype: ComponentType): T | undefined;
    getByType<T extends EcsWorldComponent>(pid: Pid, ntype: ComponentType): T | undefined;
    requireC<T extends EcsWorldComponent>(pid: Pid, ntype: ComponentType): T;
    getByNid<T extends NetworkComponent = NetworkComponent>(nid: ComponentNid): T | undefined;
    has(pid: Pid, ntype: ComponentType): boolean;
    hasAll(pid: Pid, ...types: ComponentType[]): boolean;
    queryPids(...types: ComponentType[]): number[];
    queryInto(types: ComponentType[], out: Pid[]): number[];
    query2<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent>(c0: ComponentCtor<T0>, c1: ComponentCtor<T1>): [number, T0, T1][];
    forEach2<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent>(c0: ComponentCtor<T0>, c1: ComponentCtor<T1>, fn: (pid: Pid, c0: T0, c1: T1) => void): void;
    forEach3<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent, T2 extends EcsWorldComponent>(c0: ComponentCtor<T0>, c1: ComponentCtor<T1>, c2: ComponentCtor<T2>, fn: (pid: Pid, c0: T0, c1: T1, c2: T2) => void): void;
    queryTypes(...ctors: ComponentCtor<EcsWorldComponent>[]): number[];
    forEach<T extends EcsWorldComponent>(ctor: ComponentCtor<T>, fn: (pid: Pid, component: T) => void): void;
    read<T extends EcsWorldComponent>(ctor: ComponentCtor<T>, fn: (pid: Pid, component: Readonly<T>) => void): void;
    read2<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent>(c0: ComponentCtor<T0>, c1: ComponentCtor<T1>, fn: (pid: Pid, c0: Readonly<T0>, c1: Readonly<T1>) => void): void;
    read3<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent, T2 extends EcsWorldComponent>(c0: ComponentCtor<T0>, c1: ComponentCtor<T1>, c2: ComponentCtor<T2>, fn: (pid: Pid, c0: Readonly<T0>, c1: Readonly<T1>, c2: Readonly<T2>) => void): void;
    write<T extends EcsWorldComponent>(ctor: ComponentCtor<T>, fn: (pid: Pid, component: T) => void): void;
    write2<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent>(c0: ComponentCtor<T0>, c1: ComponentCtor<T1>, fn: (pid: Pid, c0: T0, c1: T1) => void): void;
    write3<T0 extends EcsWorldComponent, T1 extends EcsWorldComponent, T2 extends EcsWorldComponent>(c0: ComponentCtor<T0>, c1: ComponentCtor<T1>, c2: ComponentCtor<T2>, fn: (pid: Pid, c0: T0, c1: T1, c2: T2) => void): void;
    set<C extends NetworkComponent, K extends keyof C & string>(component: C, prop: K, value: C[K]): void;
    group<C extends NetworkComponent>(component: C, groupName: string, ...values: any[]): void;
    componentTypes(pid: Pid): number[];
    components(pid: Pid): EcsWorldComponent[];
    rootsWith(ntype: ComponentType): number[];
    isNetworkedComponent(pid: Pid, ntype: ComponentType): boolean;
    isLocalId(id: number): boolean;
    isNetworkId(id: number): boolean;
    countEntities(): number;
    countComponents(ntype?: ComponentType): number;
    debugStats(): {
        entities: number;
        components: number;
        componentTypes: number;
        networkComponents: number;
        resources: number;
        queries: number;
    };
    private addRecord;
    private ensureType;
    private findSmallestRootSet;
    private collectQuery;
    private markRootTouched;
    private requireChannel;
    private requireSpatialChannel;
}
export declare class EcsQuery<Ctors extends readonly ComponentCtor<any>[]> {
    readonly name: string;
    private world;
    private ctors;
    readonly ntypes: ComponentType[];
    private matchingRoots;
    private enterHandlers;
    private exitHandlers;
    constructor(name: string, world: EcsWorld, ctors: Ctors);
    onEnter(fn: QueryEach<Ctors>, options?: {
        includeExisting?: boolean;
    }): this;
    onExit(fn: (pid: Pid) => void): this;
    each(fn: QueryEach<Ctors>): void;
    eachComponents(fn: QueryComponentEach<Ctors>): void;
    has(pid: Pid): boolean;
    roots(): number[];
    size(): number;
    refresh(pids: Iterable<Pid>): void;
    refreshOne(pid: Pid): void;
    refreshAll(): void;
    private refreshRoot;
    private collectComponents;
}
export declare function readSystem(name: string, run: (world: ReadWorld, dtMs: number) => void): EcsSystem<ReadWorld>;
export declare function writeSystem(name: string, run: (world: EcsWorld, dtMs: number) => void): EcsSystem;
export declare function runSystems(world: EcsWorld, systems: readonly EcsSystem<any>[], dtMs: number): void;
//# sourceMappingURL=EcsWorld.d.ts.map