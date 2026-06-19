export type Pid = number;
export type Nid = number;
export type ComponentTypeId = number;
export type Component = {
    pid: Pid;
    ntype: ComponentTypeId;
    nid?: Nid;
};
export type NetworkComponent = Component & {
    nid: Nid;
};
export type IdentifiedComponent = Component & {
    nid: Nid;
};
export type ComponentDef<T extends {
    ntype: number;
}> = {
    readonly ntype: T['ntype'];
    readonly debugName?: string;
    create(state: Omit<T, 'ntype'>): T;
};
export type ComponentOf<Def> = Def extends ComponentDef<infer T> ? T & Component : never;
export type QueryComponents<Defs extends readonly ComponentDef<any>[]> = {
    [K in keyof Defs]: ComponentOf<Defs[K]>;
};
export type Query<Defs extends readonly ComponentDef<any>[]> = {
    all(fn: (pid: Pid, ...components: QueryComponents<Defs>) => void): void;
    pids(out?: Pid[]): Pid[];
};
export declare function componentType<T extends {
    ntype: number;
}>(ntype: number, debugName?: string): ComponentDef<T>;
export declare function localComponentType<T extends object>(debugName?: string): ComponentDef<T & {
    ntype: number;
}>;
export declare class GameEcsWorld {
    private nextLocalId;
    private entities;
    private byPid;
    private byType;
    private byNid;
    private resources;
    private cachedQueries;
    private touchedPids;
    createEntity(pid?: number): number;
    create(pid?: number): number;
    add<T extends Component>(component: T): T;
    addLocalComponent<T extends {
        ntype: number;
    }>(pid: Pid, component: T): T & Component;
    removeComponentByNid(nid: Nid): IdentifiedComponent | undefined;
    removeComponent(pid: Pid, type: ComponentTypeId | ComponentDef<any>): Component | undefined;
    removeEntity(pid: Pid): Component[];
    get<T extends {
        ntype: number;
    }>(pid: Pid, def: ComponentDef<T>): (T & Component) | undefined;
    require<T extends {
        ntype: number;
    }>(pid: Pid, def: ComponentDef<T>): T & Component;
    getByNid<T extends IdentifiedComponent = IdentifiedComponent>(nid: Nid): T | undefined;
    componentOwner(nid: Nid): number | undefined;
    componentNtype(nid: Nid): number | undefined;
    componentNidsForEntity(pid: Pid): number[];
    has(pid: Pid, type: ComponentTypeId | ComponentDef<any>): boolean;
    query<const Defs extends readonly ComponentDef<any>[]>(...defs: Defs): Query<Defs>;
    cachedQuery<const Defs extends readonly ComponentDef<any>[]>(...defs: Defs): Query<Defs>;
    flushQueries(): void;
    resource<T>(key: ResourceKey<T>, create?: () => T): T;
    setResource<T>(key: ResourceKey<T>, value: T): T;
    componentCount(type?: ComponentTypeId | ComponentDef<any>): number;
    entityCount(): number;
    identifiedComponentCount(): number;
    matchingPids(types: readonly ComponentTypeId[], out?: Pid[]): number[];
    componentsFor<Defs extends readonly ComponentDef<any>[]>(pid: Pid, defs: Defs): QueryComponents<Defs> | undefined;
    private typeStore;
    private hasAll;
    private smallestStore;
    private touch;
    private nextId;
}
export type ResourceCtor<T> = abstract new (...args: any[]) => T;
export type ResourceToken<T> = {
    name: string;
    _type?: T;
};
export type ResourceKey<T> = ResourceCtor<T> | ResourceToken<T>;
export declare function resourceKey<T>(name: string): ResourceToken<T>;
//# sourceMappingURL=GameEcsWorld.d.ts.map