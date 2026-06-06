import { Binary } from '../common/binary/Binary'
import { BinaryAdapter, BinaryPayload } from '../common/binary/BinaryAdapter'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { IEntity } from '../common/IEntity'
import { AABB2D } from '../server/AABB2D'
import { CellChannel } from '../server/CellChannel'
import { Channel } from '../server/Channel'
import { MutationChannel } from '../server/MutationChannel'
import { TrustedMutationChannel } from '../server/TrustedMutationChannel'
import { TrustedMutationSpatialChannel } from '../server/TrustedMutationSpatialChannel'
import { MutationCellChannel } from '../server/MutationCellChannel'
import { EcsChannel } from '../server/EcsChannel'
import { EcsSpatialChannel } from '../server/EcsSpatialChannel'
import { ChannelAABB2D } from '../server/ChannelAABB2D'
import { ChannelAABB2DCell } from '../server/ChannelAABB2DCell'
import { ChannelAABB2DSparseGrid } from '../server/ChannelAABB2DSparseGrid'
import { EntityCache } from '../server/EntityCache'
import { IChannel } from '../server/IChannel'
import { Instance } from '../server/Instance'
import { User } from '../server/User'
import { MutationMode } from '../server/LocalState'
import { IServerNetworkAdapter } from '../server/adapter/IServerNetworkAdapter'
import { countSnapshotBytes, writeSnapshot } from '../binary/snapshot/createSnapshotBufferRefactor'
import { createEmptySnapshotPlan, SnapshotPlan } from '../binary/snapshot/SnapshotPlan'
import { TestBufferReader, TestBufferWriter, testBinaryAdapter } from '../testSupport/BufferBinary'

enum NType {
    Entity = 1,
    WideEntity = 2,
    EcsRoot = 3,
    TransformComponent = 4,
    VitalsComponent = 5,
    LoadoutComponent = 6
}

type ScenarioName =
    | 'shared-npcs'
    | 'players-300'
    | 'sparse-visible'
    | 'non-overlap'
    | 'aabb-bruteforce'
    | 'aabb-grid'
    | 'aabb-cell'
    | 'cell-channel'
    | 'mutation-cell-channel'
    | 'aabb-grid-cache'
    | 'channel-mutation'
    | 'trusted-channel'
    | 'trusted-spatial-channel'
    | 'wide-channel'
    | 'wide-trusted-channel'
    | 'ecs-trusted-channel'
    | 'ecs-channel'
    | 'ecs-channel-churn'
    | 'ecs-spatial-channel'
    | 'wide-trusted-spatial'
    | 'ecs-trusted-spatial'
    | 'parent-child-channel'
    | 'parent-child-trusted-channel'
    | 'parent-child-cell-channel'
    | 'parent-child-trusted-spatial-channel'
    | 'channel-churn'

const SCENARIOS = new Set<ScenarioName>([
    'shared-npcs',
    'players-300',
    'sparse-visible',
    'non-overlap',
    'aabb-bruteforce',
    'aabb-grid',
    'aabb-cell',
    'cell-channel',
    'mutation-cell-channel',
    'aabb-grid-cache',
    'channel-mutation',
    'trusted-channel',
    'trusted-spatial-channel',
    'wide-channel',
    'wide-trusted-channel',
    'ecs-trusted-channel',
    'ecs-channel',
    'ecs-channel-churn',
    'ecs-spatial-channel',
    'wide-trusted-spatial',
    'ecs-trusted-spatial',
    'parent-child-channel',
    'parent-child-trusted-channel',
    'parent-child-cell-channel',
    'parent-child-trusted-spatial-channel',
    'channel-churn'
])

type SpatialCacheVariant = 'current-exact' | 'cell-fragments' | 'interior-fragments'
type ExplicitMutationApi = 'mutate' | 'mark'
type TrustedEmitMode = 'group4' | 'props'
type EntityShape = 'standard' | 'monolith' | 'ecs'

const CUSTOM_MUTATION_SCENARIOS = new Set<ScenarioName>([
    'channel-churn',
    'channel-mutation',
    'trusted-channel',
    'trusted-spatial-channel',
    'wide-channel',
    'wide-trusted-channel',
    'wide-trusted-spatial',
    'ecs-trusted-channel',
    'ecs-channel',
    'ecs-channel-churn',
    'ecs-trusted-spatial',
    'ecs-spatial-channel',
    'mutation-cell-channel',
    'parent-child-trusted-channel',
    'parent-child-trusted-spatial-channel'
])

type TestEntity = IEntity & {
    x: number
    y: number
    z: number
    rot: number
    color: string
    shape: number
}

type WideEntity = TestEntity & {
    hp: number
    maxHp: number
    shield: number
    weapon: number
    ammo: number
    reload: number
}

type EcsRoot = IEntity & {
    x: number
    y: number
}

type TransformComponent = IEntity & {
    x: number
    y: number
    z: number
    rot: number
}

type VitalsComponent = IEntity & {
    hp: number
    maxHp: number
    shield: number
}

type LoadoutComponent = IEntity & {
    weapon: number
    ammo: number
    reload: number
}

type EcsBundle = {
    root: EcsRoot
    transform: TransformComponent
    vitals: VitalsComponent
    loadout: LoadoutComponent
}

type ScenarioConfig = {
    scenario: ScenarioName
    users: number
    entities: number
    visible: number
    ticks: number
    warmup: number
    sharedUpdates: boolean
    groups: boolean
    nidStart: number
    cellSize: number
    viewHalf: number
    churn: number
    children: number
    spatialDistribution: string
    worldSize: number
    clusters: number
    moveFraction: number
    queryPadding: number
    spatialCacheVariant: SpatialCacheVariant
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    mutationMode: MutationMode
    explicitMutationApi: ExplicitMutationApi
    trustedEmitMode: TrustedEmitMode
    entityShape: EntityShape
    dirtyCellFullScanThreshold: number
    dirtyCellFullScanMinEntities: number
}

class CountingAdapter implements IServerNetworkAdapter<Buffer, Buffer> {
    network: any
    binary: BinaryAdapter<Buffer, Buffer> = {
        createReader(buffer: BinaryPayload) {
            return new TestBufferReader(buffer as Buffer)
        },
        createWriter(bytes: number) {
            return TestBufferWriter.create(bytes)
        }
    }
    sends = 0
    bytes = 0

    listen(port: number, ready: () => void) {
        ready()
    }

    send(user: User, buffer: Buffer) {
        this.sends++
        this.bytes += buffer.byteLength
    }

    disconnect(user: User, reason: any): void {
    }
}

class FixedVisibleChannel implements IChannel {
    nid: number
    entities: any
    users = new Map<number, User>()
    private visibleByUser = new Map<number, number[]>()

    constructor(nid: number) {
        this.nid = nid
        this.entities = { array: [], size: 0 }
    }

    addMessage(message: any): void {
    }

    addEntity(entity: IEntity): IEntity {
        this.entities.array.push(entity)
        this.entities.size = this.entities.array.length
        return entity
    }

    removeEntity(entity: IEntity): void {
    }

    removeAllEntities(): void {
    }

    subscribe(user: User): void {
        this.users.set(user.id, user)
        user.subscribe(this)
    }

    unsubscribe(user: User): void {
        this.users.delete(user.id)
        user.unsubscribe(this)
    }

    unsubscribeAll(): void {
    }

    destroy(): void {
    }

    tick(tick: number): void {
    }

    setVisible(userId: number, nids: number[]) {
        this.visibleByUser.set(userId, nids)
    }

    getVisibleEntities(userId: number): number[] {
        return this.visibleByUser.get(userId) || []
    }
}

function envNumber(name: string, fallback: number) {
    const value = Number(process.env[name])
    return Number.isFinite(value) ? value : fallback
}

function envBool(name: string, fallback: boolean) {
    const value = process.env[name]
    if (value === undefined) {
        return fallback
    }
    return value === '1' || value === 'true'
}

function readConfig(): ScenarioConfig {
    const scenarioValue = process.env.PROFILE_SCENARIO || 'shared-npcs'
    if (!SCENARIOS.has(scenarioValue as ScenarioName)) {
        throw new Error(`Unknown PROFILE_SCENARIO "${scenarioValue}". Use one of: ${Array.from(SCENARIOS).join(', ')}`)
    }
    const scenario = scenarioValue as ScenarioName
    const spatialCacheVariant = process.env.PROFILE_SPATIAL_CACHE_VARIANT || 'current-exact'
    if (spatialCacheVariant !== 'current-exact' &&
        spatialCacheVariant !== 'cell-fragments' &&
        spatialCacheVariant !== 'interior-fragments') {
        throw new Error('PROFILE_SPATIAL_CACHE_VARIANT must be "current-exact", "cell-fragments", or "interior-fragments".')
    }

    const mutationMode = process.env.PROFILE_MUTATION_MODE || 'implicit'
    if (mutationMode !== 'implicit' &&
        mutationMode !== 'dirtyEntity' &&
        mutationMode !== 'explicit') {
        throw new Error('PROFILE_MUTATION_MODE must be "implicit", "dirtyEntity", or "explicit".')
    }
    const explicitMutationApi = process.env.PROFILE_EXPLICIT_API || 'mutate'
    if (explicitMutationApi !== 'mutate' && explicitMutationApi !== 'mark') {
        throw new Error('PROFILE_EXPLICIT_API must be "mutate" or "mark".')
    }
    const trustedEmitMode = process.env.PROFILE_TRUSTED_EMIT || 'group4'
    if (trustedEmitMode !== 'group4' && trustedEmitMode !== 'props') {
        throw new Error('PROFILE_TRUSTED_EMIT must be "group4" or "props".')
    }
    const entityShape = process.env.PROFILE_ENTITY_SHAPE || (
        scenario.startsWith('wide-') ? 'monolith' : scenario.startsWith('ecs-') ? 'ecs' : 'standard'
    )
    if (entityShape !== 'standard' && entityShape !== 'monolith' && entityShape !== 'ecs') {
        throw new Error('PROFILE_ENTITY_SHAPE must be "standard", "monolith", or "ecs".')
    }

    return {
        scenario,
        users: Math.max(1, Math.floor(envNumber('PROFILE_USERS', scenario === 'players-300' ? 300 : 20))),
        entities: Math.max(1, Math.floor(envNumber('PROFILE_ENTITIES', scenario === 'sparse-visible' ? 50000 : scenario === 'players-300' ? 302 : 1000))),
        visible: Math.max(1, Math.floor(envNumber('PROFILE_VISIBLE', scenario === 'sparse-visible' ? 200 : scenario === 'players-300' ? 302 : 1000))),
        ticks: Math.max(1, Math.floor(envNumber('PROFILE_TICKS', 300))),
        warmup: Math.max(0, Math.floor(envNumber('PROFILE_WARMUP', 60))),
        sharedUpdates: envBool('PROFILE_SHARED_UPDATES', false),
        groups: !envBool('PROFILE_GROUPS_OFF', false),
        nidStart: Math.max(1, Math.floor(envNumber('PROFILE_NID_START', 1))),
        cellSize: Math.max(1, envNumber('PROFILE_CELL_SIZE', 50)),
        viewHalf: Math.max(1, envNumber('PROFILE_VIEW_HALF', Math.sqrt(Math.max(1, envNumber('PROFILE_VISIBLE', scenario === 'sparse-visible' ? 200 : scenario === 'players-300' ? 302 : 1000))) * 1.5)),
        churn: Math.max(0, Math.floor(envNumber('PROFILE_CHURN', scenario === 'channel-churn' || scenario === 'ecs-channel-churn' ? 100 : 0))),
        children: Math.max(0, Math.floor(envNumber('PROFILE_CHILDREN', scenario === 'channel-churn' ? 1 : 0))),
        spatialDistribution: process.env.PROFILE_SPATIAL_DISTRIBUTION || 'default',
        worldSize: Math.max(1, envNumber('PROFILE_WORLD_SIZE', 5000)),
        clusters: Math.max(1, Math.floor(envNumber('PROFILE_CLUSTERS', 8))),
        moveFraction: Math.min(1, Math.max(0, envNumber('PROFILE_MOVE_FRACTION', 1))),
        queryPadding: Math.max(0, envNumber('PROFILE_QUERY_PADDING', 0)),
        spatialCacheVariant: spatialCacheVariant as SpatialCacheVariant,
        fragmentCellLimit: Math.max(1, Math.floor(envNumber('PROFILE_FRAGMENT_CELL_LIMIT', 16))),
        stableFragmentCellLimit: Math.max(1, Math.floor(envNumber('PROFILE_STABLE_FRAGMENT_CELL_LIMIT', 64))),
        mutationMode: mutationMode as MutationMode,
        explicitMutationApi: explicitMutationApi as ExplicitMutationApi,
        trustedEmitMode: trustedEmitMode as TrustedEmitMode,
        entityShape: entityShape as EntityShape,
        dirtyCellFullScanThreshold: Math.min(1, Math.max(0, envNumber('PROFILE_DIRTY_CELL_FULL_SCAN_THRESHOLD', 0.65))),
        dirtyCellFullScanMinEntities: Math.max(1, Math.floor(envNumber('PROFILE_DIRTY_CELL_FULL_SCAN_MIN_ENTITIES', 8)))
    }
}

function createContext(groups: boolean) {
    const context = new Context()
    context.register(NType.Entity, defineEntitySchema({
        x: { type: Binary.Float32, interp: true },
        y: { type: Binary.Float32, interp: true },
        z: { type: Binary.Float32, interp: true },
        rot: { type: Binary.Float32, interp: true },
        color: Binary.String,
        shape: Binary.UInt8,
        $options: groups ? {
            updateGroups: {
                transform: ['x', 'y', 'z', 'rot']
            }
        } : undefined
    }))
    context.register(NType.WideEntity, defineEntitySchema({
        x: { type: Binary.Float32, interp: true },
        y: { type: Binary.Float32, interp: true },
        z: { type: Binary.Float32, interp: true },
        rot: { type: Binary.Float32, interp: true },
        hp: Binary.UInt16,
        maxHp: Binary.UInt16,
        shield: Binary.UInt16,
        weapon: Binary.UInt8,
        ammo: Binary.UInt16,
        reload: Binary.Float32,
        $options: groups ? {
            updateGroups: {
                transform: ['x', 'y', 'z', 'rot'],
                vitals: ['hp', 'maxHp', 'shield'],
                loadout: ['weapon', 'ammo', 'reload']
            }
        } : undefined
    }))
    context.register(NType.EcsRoot, defineEntitySchema({
        x: { type: Binary.Float32, interp: true },
        y: { type: Binary.Float32, interp: true }
    }))
    context.register(NType.TransformComponent, defineEntitySchema({
        x: { type: Binary.Float32, interp: true },
        y: { type: Binary.Float32, interp: true },
        z: { type: Binary.Float32, interp: true },
        rot: { type: Binary.Float32, interp: true },
        $options: groups ? {
            updateGroups: {
                transform: ['x', 'y', 'z', 'rot']
            }
        } : undefined
    }))
    context.register(NType.VitalsComponent, defineEntitySchema({
        hp: Binary.UInt16,
        maxHp: Binary.UInt16,
        shield: Binary.UInt16,
        $options: groups ? {
            updateGroups: {
                vitals: ['hp', 'maxHp', 'shield']
            }
        } : undefined
    }))
    context.register(NType.LoadoutComponent, defineEntitySchema({
        weapon: Binary.UInt8,
        ammo: Binary.UInt16,
        reload: Binary.Float32,
        $options: groups ? {
            updateGroups: {
                loadout: ['weapon', 'ammo', 'reload']
            }
        } : undefined
    }))
    return context
}

function createEntity(index: number): TestEntity {
    return {
        nid: 0,
        ntype: NType.Entity,
        x: 80 + (index % 100) * 3,
        y: 80 + Math.floor(index / 100) * 3,
        z: 0,
        rot: 0,
        color: index % 2 === 0 ? '#50e3c2' : '#c084fc',
        shape: index % 2 === 0 ? 1 : 2
    }
}

function createWideEntity(index: number): WideEntity {
    return {
        ...createEntity(index),
        ntype: NType.WideEntity,
        hp: 900 + (index % 100),
        maxHp: 1000,
        shield: 100 + (index % 50),
        weapon: index % 8,
        ammo: 30 + (index % 60),
        reload: 0
    }
}

function createEcsRoot(index: number): EcsRoot {
    const entity = createEntity(index)
    return {
        nid: 0,
        ntype: NType.EcsRoot,
        x: entity.x,
        y: entity.y
    }
}

function createEcsBundle(index: number): EcsBundle {
    const entity = createWideEntity(index)
    return {
        root: {
            nid: 0,
            ntype: NType.EcsRoot,
            x: entity.x,
            y: entity.y
        },
        transform: {
            nid: 0,
            ntype: NType.TransformComponent,
            x: entity.x,
            y: entity.y,
            z: entity.z,
            rot: entity.rot
        },
        vitals: {
            nid: 0,
            ntype: NType.VitalsComponent,
            hp: entity.hp,
            maxHp: entity.maxHp,
            shield: entity.shield
        },
        loadout: {
            nid: 0,
            ntype: NType.LoadoutComponent,
            weapon: entity.weapon,
            ammo: entity.ammo,
            reload: entity.reload
        }
    }
}

function spreadEntitiesSingleCell(entities: TestEntity[], config: ScenarioConfig) {
    const side = Math.max(1, config.cellSize * 0.8)
    const columns = Math.ceil(Math.sqrt(entities.length))
    const spacing = side / Math.max(1, columns)
    for (let i = 0; i < entities.length; i++) {
        entities[i].x = (i % columns) * spacing + spacing * 0.5
        entities[i].y = Math.floor(i / columns) * spacing + spacing * 0.5
    }
}

function spreadEntitiesCenteredCell(entities: TestEntity[], config: ScenarioConfig) {
    const side = Math.max(1, config.cellSize * 0.5)
    const origin = config.cellSize * 0.25
    const columns = Math.ceil(Math.sqrt(entities.length))
    const spacing = side / Math.max(1, columns)
    for (let i = 0; i < entities.length; i++) {
        entities[i].x = origin + (i % columns) * spacing + spacing * 0.5
        entities[i].y = origin + Math.floor(i / columns) * spacing + spacing * 0.5
    }
}

function spreadEntitiesHomogeneous(entities: TestEntity[], config: ScenarioConfig) {
    const columns = Math.ceil(Math.sqrt(entities.length))
    const spacing = config.worldSize / Math.max(1, columns)
    for (let i = 0; i < entities.length; i++) {
        entities[i].x = (i % columns) * spacing + spacing * 0.5
        entities[i].y = Math.floor(i / columns) * spacing + spacing * 0.5
    }
}

function spreadEntitiesClustered(entities: TestEntity[], config: ScenarioConfig) {
    const clusterColumns = Math.ceil(Math.sqrt(config.clusters))
    const clusterSpacing = config.worldSize / Math.max(1, clusterColumns)
    const radius = Math.max(config.viewHalf * 0.75, config.cellSize * 0.75)
    for (let i = 0; i < entities.length; i++) {
        const cluster = i % config.clusters
        const cx = (cluster % clusterColumns) * clusterSpacing + clusterSpacing * 0.5
        const cy = Math.floor(cluster / clusterColumns) * clusterSpacing + clusterSpacing * 0.5
        const angle = i * 2.399963229728653
        const distance = ((i * 37) % 1000) / 1000 * radius
        entities[i].x = cx + Math.cos(angle) * distance
        entities[i].y = cy + Math.sin(angle) * distance
    }
}

function applySpatialDistribution(entities: TestEntity[], config: ScenarioConfig) {
    if (config.spatialDistribution === 'single-cell') {
        spreadEntitiesSingleCell(entities, config)
    } else if (config.spatialDistribution === 'centered-cell') {
        spreadEntitiesCenteredCell(entities, config)
    } else if (config.spatialDistribution === 'homogeneous') {
        spreadEntitiesHomogeneous(entities, config)
    } else if (config.spatialDistribution === 'clustered') {
        spreadEntitiesClustered(entities, config)
    }
}

function createUser(instance: Instance, id: number, adapter: CountingAdapter) {
    const user = new User(undefined, adapter as any)
    user.id = id
    user.instance = instance
    instance.users.set(user.id, user)
    return user
}

function mutateEntities(entities: TestEntity[], tick: number, moveFraction = 1) {
    const moving = Math.floor(entities.length * moveFraction)
    for (let i = 0; i < moving; i++) {
        const entity = entities[i]
        const angle = tick * 0.07 + i * 0.013
        entity.x += Math.cos(angle) * 0.4
        entity.y += Math.sin(angle * 1.13) * 0.4
        entity.z = Math.sin(angle * 0.73) * 18
        entity.rot = (entity.rot + 0.035 + (i % 7) * 0.001) % (Math.PI * 2)
    }
}

function mutateTrustedEntities(
    entities: TestEntity[],
    tick: number,
    moveFraction: number,
    transform: (entity: TestEntity, x: number, y: number, z: number, rot: number) => void,
    props?: {
        x: (entity: TestEntity, value: number) => void
        y: (entity: TestEntity, value: number) => void
        z: (entity: TestEntity, value: number) => void
        rot: (entity: TestEntity, value: number) => void
    },
    emitMode: TrustedEmitMode = 'group4'
) {
    const moving = Math.floor(entities.length * moveFraction)
    for (let i = 0; i < moving; i++) {
        const entity = entities[i]
        const angle = tick * 0.07 + i * 0.013
        const x = entity.x + Math.cos(angle) * 0.4
        const y = entity.y + Math.sin(angle * 1.13) * 0.4
        const z = Math.sin(angle * 0.73) * 18
        const rot = (entity.rot + 0.035 + (i % 7) * 0.001) % (Math.PI * 2)
        entity.x = x
        entity.y = y
        entity.z = z
        entity.rot = rot
        if (emitMode === 'props' && props) {
            props.x(entity, x)
            props.y(entity, y)
            props.z(entity, z)
            props.rot(entity, rot)
        } else {
            transform(entity, x, y, z, rot)
        }
    }
}

function nextStateValues(
    x: number,
    y: number,
    z: number,
    rot: number,
    hp: number,
    maxHp: number,
    shield: number,
    weapon: number,
    ammo: number,
    reload: number,
    tick: number,
    index: number
) {
    const angle = tick * 0.07 + index * 0.013
    return {
        x: x + Math.cos(angle) * 0.4,
        y: y + Math.sin(angle * 1.13) * 0.4,
        z: Math.sin(angle * 0.73) * 18,
        rot: (rot + 0.035 + (index % 7) * 0.001) % (Math.PI * 2),
        hp: 800 + ((tick + index) % 200),
        maxHp,
        shield: (shield + 1 + (index % 3)) % 250,
        weapon: (weapon + (tick % 17 === 0 ? 1 : 0)) % 8,
        ammo: (ammo + 59) % 120,
        reload: (reload + 0.016 + (index % 5) * 0.001) % 1
    }
}

function nextWideValues(entity: WideEntity, tick: number, index: number) {
    return nextStateValues(
        entity.x,
        entity.y,
        entity.z,
        entity.rot,
        entity.hp,
        entity.maxHp,
        entity.shield,
        entity.weapon,
        entity.ammo,
        entity.reload,
        tick,
        index
    )
}

function applyWideValues(entity: WideEntity, values: ReturnType<typeof nextWideValues>) {
    entity.x = values.x
    entity.y = values.y
    entity.z = values.z
    entity.rot = values.rot
    entity.hp = values.hp
    entity.maxHp = values.maxHp
    entity.shield = values.shield
    entity.weapon = values.weapon
    entity.ammo = values.ammo
    entity.reload = values.reload
}

function attachChildren(instance: Instance, roots: TestEntity[], config: ScenarioConfig) {
    const children: TestEntity[] = []
    let nextIndex = roots.length
    for (let i = 0; i < roots.length; i++) {
        const parent = roots[i]
        for (let childIndex = 0; childIndex < config.children; childIndex++) {
            const child = createEntity(nextIndex++)
            child.x = parent.x
            child.y = parent.y
            child.z = childIndex + 1
            instance.attachChild(parent, child)
            children.push(child)
        }
    }
    return children
}

function subscribeAll(channel: IChannel, users: User[]) {
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i])
    }
}

function setupShared(instance: Instance, users: User[], entities: TestEntity[]) {
    const channel = new Channel(instance.localState, { label: 'shared' })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    subscribeAll(channel, users)
}

function setupWideChannel(instance: Instance, users: User[], entities: WideEntity[], config: ScenarioConfig) {
    const channel = new Channel(instance.localState, { label: 'wide' })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    subscribeAll(channel, users)
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const entity = entities[i]
            applyWideValues(entity, nextWideValues(entity, instance.tick, i))
        }
    }
}

function setupMutationChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new MutationChannel(instance.localState, {
        label: `mutation:${config.mutationMode}`,
        mutationMode: config.mutationMode
    })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    subscribeAll(channel, users)
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const entity = entities[i]
            const angle = instance.tick * 0.07 + i * 0.013
            if (config.mutationMode === 'explicit') {
                const x = entity.x + Math.cos(angle) * 0.4
                const y = entity.y + Math.sin(angle * 1.13) * 0.4
                const z = Math.sin(angle * 0.73) * 18
                const rot = (entity.rot + 0.035 + (i % 7) * 0.001) % (Math.PI * 2)
                if (config.explicitMutationApi === 'mark') {
                    entity.x = x
                    entity.y = y
                    entity.z = z
                    entity.rot = rot
                    if (config.groups) {
                        channel.markGroupDirty(entity, 'transform')
                    } else {
                        channel.markPropDirty(entity, 'x')
                        channel.markPropDirty(entity, 'y')
                        channel.markPropDirty(entity, 'z')
                        channel.markPropDirty(entity, 'rot')
                    }
                } else {
                    if (config.groups) {
                        channel.mutateGroup(entity, 'transform', { x, y, z, rot })
                    } else {
                        channel.mutate(entity, 'x', x)
                        channel.mutate(entity, 'y', y)
                        channel.mutate(entity, 'z', z)
                        channel.mutate(entity, 'rot', rot)
                    }
                }
            } else {
                entity.x += Math.cos(angle) * 0.4
                entity.y += Math.sin(angle * 1.13) * 0.4
                entity.z = Math.sin(angle * 0.73) * 18
                entity.rot = (entity.rot + 0.035 + (i % 7) * 0.001) % (Math.PI * 2)
                if (config.mutationMode === 'dirtyEntity') {
                    channel.markDirty(entity)
                }
            }
        }
    }
}

function setupTrustedChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new TrustedMutationChannel(instance.localState, { label: 'trusted' })
    const Entity = channel.type(NType.Entity, instance.context.getSchema(NType.Entity)!)
    const transform = Entity.transform
    const propX = Entity.x
    const propY = Entity.y
    const propZ = Entity.z
    const propRot = Entity.rot
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    subscribeAll(channel, users)
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const entity = entities[i]
            const angle = instance.tick * 0.07 + i * 0.013
            const x = entity.x + Math.cos(angle) * 0.4
            const y = entity.y + Math.sin(angle * 1.13) * 0.4
            const z = Math.sin(angle * 0.73) * 18
            const rot = (entity.rot + 0.035 + (i % 7) * 0.001) % (Math.PI * 2)
            entity.x = x
            entity.y = y
            entity.z = z
            entity.rot = rot
            if (config.trustedEmitMode === 'props') {
                propX(entity, x)
                propY(entity, y)
                propZ(entity, z)
                propRot(entity, rot)
            } else {
                transform(entity, x, y, z, rot)
            }
        }
    }
}

function setupTrustedSpatialChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new TrustedMutationSpatialChannel(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        label: 'trusted-spatial'
    })
    const Entity = channel.type(NType.Entity, instance.context.getSchema(NType.Entity)!)
    const transform = Entity.transform
    const propX = Entity.x
    const propY = Entity.y
    const propZ = Entity.z
    const propRot = Entity.rot
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities, config))
    }
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const entity = entities[i]
            const angle = instance.tick * 0.07 + i * 0.013
            const x = entity.x + Math.cos(angle) * 0.4
            const y = entity.y + Math.sin(angle * 1.13) * 0.4
            const z = Math.sin(angle * 0.73) * 18
            const rot = (entity.rot + 0.035 + (i % 7) * 0.001) % (Math.PI * 2)
            entity.x = x
            entity.y = y
            entity.z = z
            entity.rot = rot
            if (config.trustedEmitMode === 'props') {
                propX(entity, x)
                propY(entity, y)
                propZ(entity, z)
                propRot(entity, rot)
            } else {
                transform(entity, x, y, z, rot)
            }
        }
    }
}

function setupWideTrustedChannel(instance: Instance, users: User[], entities: WideEntity[], config: ScenarioConfig) {
    const channel = new TrustedMutationChannel(instance.localState, { label: 'wide-trusted' })
    const Wide = channel.type(NType.WideEntity, instance.context.getSchema(NType.WideEntity)!)
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    subscribeAll(channel, users)
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const entity = entities[i]
            const values = nextWideValues(entity, instance.tick, i)
            applyWideValues(entity, values)
            Wide.transform(entity, values.x, values.y, values.z, values.rot)
            Wide.vitals(entity, values.hp, values.maxHp, values.shield)
            Wide.loadout(entity, values.weapon, values.ammo, values.reload)
        }
    }
}

function setupWideTrustedSpatial(instance: Instance, users: User[], entities: WideEntity[], config: ScenarioConfig) {
    const channel = new TrustedMutationSpatialChannel(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        label: 'wide-trusted-spatial'
    })
    const Wide = channel.type(NType.WideEntity, instance.context.getSchema(NType.WideEntity)!)
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities as any, config))
    }
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const entity = entities[i]
            const values = nextWideValues(entity, instance.tick, i)
            applyWideValues(entity, values)
            Wide.transform(entity, values.x, values.y, values.z, values.rot)
            Wide.vitals(entity, values.hp, values.maxHp, values.shield)
            Wide.loadout(entity, values.weapon, values.ammo, values.reload)
        }
    }
}

function setupEcsTrustedChannel(instance: Instance, users: User[], bundles: EcsBundle[], config: ScenarioConfig) {
    const channel = new TrustedMutationChannel(instance.localState, { label: 'ecs-trusted' })
    const Transform = channel.type(NType.TransformComponent, instance.context.getSchema(NType.TransformComponent)!)
    const Vitals = channel.type(NType.VitalsComponent, instance.context.getSchema(NType.VitalsComponent)!)
    const Loadout = channel.type(NType.LoadoutComponent, instance.context.getSchema(NType.LoadoutComponent)!)
    for (let i = 0; i < bundles.length; i++) {
        const bundle = bundles[i]
        channel.addEntity(bundle.root)
        instance.attachChild(bundle.root, bundle.transform)
        instance.attachChild(bundle.root, bundle.vitals)
        instance.attachChild(bundle.root, bundle.loadout)
    }
    subscribeAll(channel, users)
    return () => {
        const moving = Math.floor(bundles.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const bundle = bundles[i]
            const values = nextStateValues(
                bundle.transform.x,
                bundle.transform.y,
                bundle.transform.z,
                bundle.transform.rot,
                bundle.vitals.hp,
                bundle.vitals.maxHp,
                bundle.vitals.shield,
                bundle.loadout.weapon,
                bundle.loadout.ammo,
                bundle.loadout.reload,
                instance.tick,
                i
            )
            bundle.root.x = values.x
            bundle.root.y = values.y
            bundle.transform.x = values.x
            bundle.transform.y = values.y
            bundle.transform.z = values.z
            bundle.transform.rot = values.rot
            bundle.vitals.hp = values.hp
            bundle.vitals.maxHp = values.maxHp
            bundle.vitals.shield = values.shield
            bundle.loadout.weapon = values.weapon
            bundle.loadout.ammo = values.ammo
            bundle.loadout.reload = values.reload
            Transform.transform(bundle.transform, values.x, values.y, values.z, values.rot)
            Vitals.vitals(bundle.vitals, values.hp, values.maxHp, values.shield)
            Loadout.loadout(bundle.loadout, values.weapon, values.ammo, values.reload)
        }
    }
}

function setupEcsChannel(instance: Instance, users: User[], bundles: EcsBundle[], config: ScenarioConfig) {
    const channel = new EcsChannel(instance.localState, { label: 'ecs' })
    const Transform = channel.type(NType.TransformComponent, instance.context.getSchema(NType.TransformComponent)!)
    const Vitals = channel.type(NType.VitalsComponent, instance.context.getSchema(NType.VitalsComponent)!)
    const Loadout = channel.type(NType.LoadoutComponent, instance.context.getSchema(NType.LoadoutComponent)!)
    for (let i = 0; i < bundles.length; i++) {
        const bundle = bundles[i]
        const pid = channel.createEntity()
        bundle.root.nid = pid
        channel.addComponent(pid, bundle.transform)
        channel.addComponent(pid, bundle.vitals)
        channel.addComponent(pid, bundle.loadout)
    }
    subscribeAll(channel, users)
    return () => {
        const moving = Math.floor(bundles.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const bundle = bundles[i]
            const values = nextStateValues(
                bundle.transform.x,
                bundle.transform.y,
                bundle.transform.z,
                bundle.transform.rot,
                bundle.vitals.hp,
                bundle.vitals.maxHp,
                bundle.vitals.shield,
                bundle.loadout.weapon,
                bundle.loadout.ammo,
                bundle.loadout.reload,
                instance.tick,
                i
            )
            bundle.root.x = values.x
            bundle.root.y = values.y
            bundle.transform.x = values.x
            bundle.transform.y = values.y
            bundle.transform.z = values.z
            bundle.transform.rot = values.rot
            bundle.vitals.hp = values.hp
            bundle.vitals.maxHp = values.maxHp
            bundle.vitals.shield = values.shield
            bundle.loadout.weapon = values.weapon
            bundle.loadout.ammo = values.ammo
            bundle.loadout.reload = values.reload
            Transform.transform(bundle.transform, values.x, values.y, values.z, values.rot)
            Vitals.vitals(bundle.vitals, values.hp, values.maxHp, values.shield)
            Loadout.loadout(bundle.loadout, values.weapon, values.ammo, values.reload)
        }
    }
}

function setupEcsChannelChurn(instance: Instance, users: User[], bundles: EcsBundle[], config: ScenarioConfig) {
    const channel = new EcsChannel(instance.localState, { label: 'ecs-churn' })
    const liveBundles = bundles.slice()
    let nextIndex = bundles.length
    let cursor = 0

    const addBundle = (bundle: EcsBundle) => {
        const pid = channel.createEntity()
        bundle.root.nid = pid
        channel.addComponent(pid, bundle.transform)
        channel.addComponent(pid, bundle.vitals)
        channel.addComponent(pid, bundle.loadout)
    }

    for (let i = 0; i < liveBundles.length; i++) {
        addBundle(liveBundles[i])
    }
    subscribeAll(channel, users)

    return () => {
        const churn = Math.min(config.churn, liveBundles.length)
        for (let i = 0; i < churn; i++) {
            const index = cursor++ % liveBundles.length
            const oldBundle = liveBundles[index]
            channel.removeEntity(oldBundle.root.nid)
            const newBundle = createEcsBundle(nextIndex++)
            liveBundles[index] = newBundle
            addBundle(newBundle)
        }
    }
}

function setupEcsTrustedSpatial(instance: Instance, users: User[], bundles: EcsBundle[], config: ScenarioConfig) {
    const channel = new TrustedMutationSpatialChannel(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        label: 'ecs-trusted-spatial'
    })
    const Transform = channel.type(NType.TransformComponent, instance.context.getSchema(NType.TransformComponent)!)
    const Vitals = channel.type(NType.VitalsComponent, instance.context.getSchema(NType.VitalsComponent)!)
    const Loadout = channel.type(NType.LoadoutComponent, instance.context.getSchema(NType.LoadoutComponent)!)
    const roots: EcsRoot[] = []
    for (let i = 0; i < bundles.length; i++) {
        const bundle = bundles[i]
        roots.push(bundle.root)
        channel.addEntity(bundle.root as any)
        instance.attachChild(bundle.root, bundle.transform)
        instance.attachChild(bundle.root, bundle.vitals)
        instance.attachChild(bundle.root, bundle.loadout)
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, roots as any, config))
    }
    return () => {
        const moving = Math.floor(bundles.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const bundle = bundles[i]
            const values = nextStateValues(
                bundle.transform.x,
                bundle.transform.y,
                bundle.transform.z,
                bundle.transform.rot,
                bundle.vitals.hp,
                bundle.vitals.maxHp,
                bundle.vitals.shield,
                bundle.loadout.weapon,
                bundle.loadout.ammo,
                bundle.loadout.reload,
                instance.tick,
                i
            )
            bundle.root.x = values.x
            bundle.root.y = values.y
            channel.updateEntity(bundle.root as any)
            bundle.transform.x = values.x
            bundle.transform.y = values.y
            bundle.transform.z = values.z
            bundle.transform.rot = values.rot
            bundle.vitals.hp = values.hp
            bundle.vitals.maxHp = values.maxHp
            bundle.vitals.shield = values.shield
            bundle.loadout.weapon = values.weapon
            bundle.loadout.ammo = values.ammo
            bundle.loadout.reload = values.reload
            Transform.transform(bundle.transform as any, values.x, values.y, values.z, values.rot)
            Vitals.vitals(bundle.vitals as any, values.hp, values.maxHp, values.shield)
            Loadout.loadout(bundle.loadout as any, values.weapon, values.ammo, values.reload)
        }
    }
}

function setupEcsSpatialChannel(instance: Instance, users: User[], bundles: EcsBundle[], config: ScenarioConfig) {
    const channel = new EcsSpatialChannel(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        label: 'ecs-spatial'
    })
    const Transform = channel.type(NType.TransformComponent, instance.context.getSchema(NType.TransformComponent)!)
    const Vitals = channel.type(NType.VitalsComponent, instance.context.getSchema(NType.VitalsComponent)!)
    const Loadout = channel.type(NType.LoadoutComponent, instance.context.getSchema(NType.LoadoutComponent)!)
    const roots: EcsRoot[] = []
    for (let i = 0; i < bundles.length; i++) {
        const bundle = bundles[i]
        roots.push(bundle.root)
        const pid = channel.createEntity()
        bundle.root.nid = pid
        channel.addSpatialComponent(pid, bundle.transform)
        channel.addComponent(pid, bundle.vitals)
        channel.addComponent(pid, bundle.loadout)
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, roots as any, config))
    }
    return () => {
        const moving = Math.floor(bundles.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const bundle = bundles[i]
            const values = nextStateValues(
                bundle.transform.x,
                bundle.transform.y,
                bundle.transform.z,
                bundle.transform.rot,
                bundle.vitals.hp,
                bundle.vitals.maxHp,
                bundle.vitals.shield,
                bundle.loadout.weapon,
                bundle.loadout.ammo,
                bundle.loadout.reload,
                instance.tick,
                i
            )
            bundle.root.x = values.x
            bundle.root.y = values.y
            bundle.transform.x = values.x
            bundle.transform.y = values.y
            bundle.transform.z = values.z
            bundle.transform.rot = values.rot
            bundle.vitals.hp = values.hp
            bundle.vitals.maxHp = values.maxHp
            bundle.vitals.shield = values.shield
            bundle.loadout.weapon = values.weapon
            bundle.loadout.ammo = values.ammo
            bundle.loadout.reload = values.reload
            Transform.transform(bundle.transform, values.x, values.y, values.z, values.rot)
            Vitals.vitals(bundle.vitals, values.hp, values.maxHp, values.shield)
            Loadout.loadout(bundle.loadout, values.weapon, values.ammo, values.reload)
        }
    }
}

function setupParentChildChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new Channel(instance.localState, { label: 'parent-child-channel' })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    const children = attachChildren(instance, entities, config)
    subscribeAll(channel, users)
    return entities.concat(children)
}

function setupParentChildTrustedChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new TrustedMutationChannel(instance.localState, { label: 'parent-child-trusted' })
    const Entity = channel.type(NType.Entity, instance.context.getSchema(NType.Entity)!)
    const allEntities = entities.slice()
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    allEntities.push(...attachChildren(instance, entities, config))
    subscribeAll(channel, users)
    return () => {
        mutateTrustedEntities(
            allEntities,
            instance.tick,
            config.moveFraction,
            Entity.transform,
            {
                x: Entity.x,
                y: Entity.y,
                z: Entity.z,
                rot: Entity.rot
            },
            config.trustedEmitMode
        )
    }
}

function setupParentChildCellChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new CellChannel(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        label: 'parent-child-cell'
    })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    const children = attachChildren(instance, entities, config)
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities, config))
    }
    const allEntities = entities.concat(children)
    return {
        allEntities,
        updateSpatialIndex() {
            const movingRoots = Math.floor(entities.length * config.moveFraction)
            for (let i = 0; i < movingRoots; i++) {
                channel.updateEntity(entities[i])
            }
        }
    }
}

function setupParentChildTrustedSpatialChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new TrustedMutationSpatialChannel(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        label: 'parent-child-trusted-spatial'
    })
    const Entity = channel.type(NType.Entity, instance.context.getSchema(NType.Entity)!)
    const allEntities = entities.slice()
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    allEntities.push(...attachChildren(instance, entities, config))
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities, config))
    }
    return () => {
        mutateTrustedEntities(
            allEntities,
            instance.tick,
            config.moveFraction,
            Entity.transform,
            {
                x: Entity.x,
                y: Entity.y,
                z: Entity.z,
                rot: Entity.rot
            },
            config.trustedEmitMode
        )
    }
}

function setupFixedVisible(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new FixedVisibleChannel(instance.localState.nextNetworkId())
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]
        instance.localState.registerEntity(entity, channel.nid)
        channel.addEntity(entity)
    }

    for (let i = 0; i < users.length; i++) {
        const user = users[i]
        channel.subscribe(user)
        const nids: number[] = []
        if (config.scenario === 'non-overlap') {
            const start = (i * config.visible) % entities.length
            for (let j = 0; j < config.visible; j++) {
                nids.push(entities[(start + j) % entities.length].nid)
            }
        } else {
            for (let j = 0; j < Math.min(config.visible, entities.length); j++) {
                nids.push(entities[j].nid)
            }
        }
        channel.setVisible(user.id, nids)
    }
}

function createSpatialView(userIndex: number, entities: TestEntity[], config: ScenarioConfig) {
    if (config.spatialDistribution === 'single-cell') {
        const side = Math.max(1, config.cellSize * 0.8)
        return new AABB2D(side * 0.5, side * 0.5, config.viewHalf, config.viewHalf)
    }
    if (config.spatialDistribution === 'centered-cell') {
        return new AABB2D(config.cellSize * 0.5, config.cellSize * 0.5, config.viewHalf, config.viewHalf)
    }
    const entity = entities[(userIndex * Math.max(1, Math.floor(entities.length / Math.max(1, config.users)))) % entities.length]
    return new AABB2D(entity.x, entity.y, config.viewHalf, config.viewHalf)
}

function setupAABBBruteforce(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new ChannelAABB2D(instance.localState)
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities, config))
    }
}

function setupAABBGrid(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new ChannelAABB2DSparseGrid(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding
    })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities, config))
    }
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            channel.updateEntity(entities[i])
        }
    }
}

function setupAABBCell(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new ChannelAABB2DCell(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        label: 'cell'
    })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities, config))
    }
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            channel.updateEntity(entities[i])
        }
    }
}

function setupCellChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new CellChannel(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        label: 'cell-channel'
    })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities, config))
    }
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            channel.updateEntity(entities[i])
        }
    }
}

function setupMutationCellChannel(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new MutationCellChannel(instance.localState, config.cellSize, {
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        label: `mutation-cell:${config.mutationMode}`,
        mutationMode: config.mutationMode,
        dirtyCellFullScanThreshold: config.dirtyCellFullScanThreshold,
        dirtyCellFullScanMinEntities: config.dirtyCellFullScanMinEntities
    })
    for (let i = 0; i < entities.length; i++) {
        channel.addEntity(entities[i])
    }
    for (let i = 0; i < users.length; i++) {
        channel.subscribe(users[i], createSpatialView(i, entities, config))
    }
    return () => {
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            const entity = entities[i]
            const angle = instance.tick * 0.07 + i * 0.013
            const values = {
                x: entity.x + Math.cos(angle) * 0.4,
                y: entity.y + Math.sin(angle * 1.13) * 0.4,
                z: Math.sin(angle * 0.73) * 18,
                rot: (entity.rot + 0.035 + (i % 7) * 0.001) % (Math.PI * 2)
            }

            if (config.mutationMode === 'explicit') {
                if (config.explicitMutationApi === 'mark') {
                    entity.x = values.x
                    entity.y = values.y
                    entity.z = values.z
                    entity.rot = values.rot
                    if (config.groups) {
                        channel.markGroupDirty(entity, 'transform')
                    } else {
                        channel.markPropDirty(entity, 'x')
                        channel.markPropDirty(entity, 'y')
                        channel.markPropDirty(entity, 'z')
                        channel.markPropDirty(entity, 'rot')
                    }
                } else {
                    if (config.groups) {
                        channel.mutateGroup(entity, 'transform', values)
                    } else {
                        channel.mutate(entity, 'x', values.x)
                        channel.mutate(entity, 'y', values.y)
                        channel.mutate(entity, 'z', values.z)
                        channel.mutate(entity, 'rot', values.rot)
                    }
                }
            } else {
                entity.x = values.x
                entity.y = values.y
                entity.z = values.z
                entity.rot = values.rot
                if (config.mutationMode === 'dirtyEntity') {
                    channel.markDirty(entity)
                }
            }
        }
    }
}

function setupChannelChurn(instance: Instance, users: User[], entities: TestEntity[], config: ScenarioConfig) {
    const channel = new Channel(instance.localState, { label: 'churn' })
    const liveEntities: TestEntity[] = []
    let nextEntityIndex = entities.length

    const addWithChildren = (entity: TestEntity) => {
        channel.addEntity(entity)
        for (let i = 0; i < config.children; i++) {
            instance.attachChild(entity, createEntity(nextEntityIndex++))
        }
        liveEntities.push(entity)
    }

    for (let i = 0; i < entities.length; i++) {
        addWithChildren(entities[i])
    }
    subscribeAll(channel, users)

    return {
        liveEntities,
        churn() {
            const count = Math.min(config.churn, liveEntities.length)
            for (let i = 0; i < count; i++) {
                const entity = liveEntities.pop()!
                channel.removeEntity(entity)
            }
            for (let i = 0; i < count; i++) {
                addWithChildren(createEntity(nextEntityIndex++))
            }
        }
    }
}

type CacheCellRef = { key: string, index: number }
type CacheCell = { key: string, x: number, y: number, entities: TestEntity[] }
type CellRange = {
    startX: number
    startY: number
    endX: number
    endY: number
    minX: number
    maxX: number
    minY: number
    maxY: number
}
type CellFragment = {
    bytes: number
    payload: Buffer
    updateProps: number
    updateGroups: number
    groupedProps: number
}

class SpatialCacheGrid {
    cells: Map<string, CacheCell> = new Map()
    entityCells: Map<number, CacheCellRef> = new Map()
    dirtyCells: Set<string> = new Set()
    cellSize: number

    constructor(cellSize: number) {
        this.cellSize = cellSize
    }

    cellKey(x: number, y: number) {
        return `${x}:${y}`
    }

    cellCoord(value: number) {
        return Math.floor(value / this.cellSize)
    }

    cellCoordForEnd(value: number) {
        return Math.ceil(value / this.cellSize) - 1
    }

    cellKeyForEntity(entity: TestEntity) {
        return this.cellKey(this.cellCoord(entity.x), this.cellCoord(entity.y))
    }

    addEntity(entity: TestEntity) {
        const x = this.cellCoord(entity.x)
        const y = this.cellCoord(entity.y)
        const key = this.cellKey(x, y)
        let cell = this.cells.get(key)
        if (!cell) {
            cell = { key, x, y, entities: [] }
            this.cells.set(key, cell)
        }
        this.entityCells.set(entity.nid, { key, index: cell.entities.length })
        cell.entities.push(entity)
    }

    removeFromCell(entity: TestEntity) {
        const ref = this.entityCells.get(entity.nid)
        if (!ref) {
            return
        }
        const cell = this.cells.get(ref.key)
        if (!cell) {
            this.entityCells.delete(entity.nid)
            return
        }
        const last = cell.entities[cell.entities.length - 1]
        cell.entities[ref.index] = last
        cell.entities.pop()
        if (last && last.nid !== entity.nid) {
            this.entityCells.set(last.nid, { key: ref.key, index: ref.index })
        }
        if (cell.entities.length === 0) {
            this.cells.delete(ref.key)
        }
        this.entityCells.delete(entity.nid)
    }

    updateEntity(entity: TestEntity) {
        const current = this.entityCells.get(entity.nid)
        if (!current) {
            return
        }

        const nextKey = this.cellKeyForEntity(entity)
        this.dirtyCells.add(current.key)
        if (current.key === nextKey) {
            return
        }

        this.removeFromCell(entity)
        this.addEntity(entity)
        this.dirtyCells.add(nextKey)
    }

    viewRange(view: AABB2D, padding: number): CellRange {
        const halfWidth = view.halfWidth + padding
        const halfHeight = view.halfHeight + padding
        const startX = view.x - halfWidth
        const startY = view.y - halfHeight
        const endX = view.x + halfWidth
        const endY = view.y + halfHeight
        return {
            startX,
            startY,
            endX,
            endY,
            minX: this.cellCoord(startX),
            maxX: this.cellCoordForEnd(endX),
            minY: this.cellCoord(startY),
            maxY: this.cellCoordForEnd(endY)
        }
    }

    getCell(x: number, y: number) {
        return this.cells.get(this.cellKey(x, y))
    }

    cellIsInterior(x: number, y: number, range: CellRange) {
        return x * this.cellSize >= range.startX &&
            y * this.cellSize >= range.startY &&
            (x + 1) * this.cellSize <= range.endX &&
            (y + 1) * this.cellSize <= range.endY
    }
}

function createUpdatePlanForEntities(
    entities: TestEntity[],
    tick: number,
    context: Context,
    cache: EntityCache,
    range?: CellRange
) {
    const plan = createEmptySnapshotPlan()
    const nschema = context.getSchema(NType.Entity)!

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]
        if (range && (
            entity.x < range.startX ||
            entity.x >= range.endX ||
            entity.y < range.startY ||
            entity.y >= range.endY
        )) {
            continue
        }
        const diffs = cache.getAndDiffGrouped(tick, entity, nschema)
        for (let j = 0; j < diffs.groups.length; j++) {
            plan.updateEntityGroups.push(diffs.groups[j])
        }
        for (let j = 0; j < diffs.changes.length; j++) {
            plan.updateEntities.push(diffs.changes[j])
        }
    }

    return plan
}

function countGroupedProps(plan: SnapshotPlan) {
    let groupedProps = 0
    for (let i = 0; i < plan.updateEntityGroups.length; i++) {
        groupedProps += plan.updateEntityGroups[i].group.props.length
    }
    return groupedProps
}

function writePlanFragment(plan: SnapshotPlan, context: Context, protocol: any): CellFragment {
    const bytes = countSnapshotBytes(plan, context, protocol)
    const writer = TestBufferWriter.create(bytes)
    writeSnapshot(plan, context, writer, protocol)
    return {
        bytes,
        payload: writer.payload,
        updateProps: plan.updateEntities.length,
        updateGroups: plan.updateEntityGroups.length,
        groupedProps: countGroupedProps(plan)
    }
}

function writeCopiedFragments(fragments: CellFragment[]) {
    let bytes = 0
    for (let i = 0; i < fragments.length; i++) {
        bytes += fragments[i].bytes
    }
    const writer = TestBufferWriter.create(bytes)
    for (let i = 0; i < fragments.length; i++) {
        writer.writeBytes(fragments[i].payload as unknown as Uint8Array)
    }
    return bytes
}

function runSpatialCacheScenario(config: ScenarioConfig) {
    const context = createContext(config.groups)
    const protocol = { nidType: Binary.UInt32, ntypeType: context.ntypeType }
    const cache = new EntityCache()
    const grid = new SpatialCacheGrid(config.cellSize)
    const entities: TestEntity[] = []
    const views: AABB2D[] = []
    const nschema = context.getSchema(NType.Entity)!

    for (let i = 0; i < config.entities; i++) {
        const entity = createEntity(i)
        entity.nid = i + 1
        entities.push(entity)
    }
    applySpatialDistribution(entities, config)
    for (let i = 0; i < entities.length; i++) {
        grid.addEntity(entities[i])
        cache.cacheify(0, entities[i], nschema)
    }
    for (let i = 0; i < config.users; i++) {
        views.push(createSpatialView(i, entities, config))
    }

    const stepTimes: number[] = []
    const indexTimes: number[] = []
    const queryTimes: number[] = []
    const fragmentBuildTimes: number[] = []
    const writeTimes: number[] = []
    const copyTimes: number[] = []
    let bytesTotal = 0
    let touchedCellsTotal = 0
    let interiorCellsTotal = 0
    let edgeCellsTotal = 0
    let exactEntitiesScannedTotal = 0
    let fragmentBuildsTotal = 0
    let fragmentCopiesTotal = 0
    let updateGroupsTotal = 0
    let groupedPropsTotal = 0

    const runTick = (tick: number, measure: boolean) => {
        cache.createCachesForTick(tick)
        grid.dirtyCells.clear()
        mutateEntities(entities, tick, config.moveFraction)

        const indexStart = performance.now()
        const moving = Math.floor(entities.length * config.moveFraction)
        for (let i = 0; i < moving; i++) {
            grid.updateEntity(entities[i])
        }
        const indexMs = performance.now() - indexStart

        const tickStart = performance.now()
        const cellFragments = new Map<string, CellFragment>()
        let queryMs = 0
        let buildMs = 0
        let writeMs = 0
        let copyMs = 0
        let tickBytes = 0
        let touchedCells = 0
        let interiorCells = 0
        let edgeCells = 0
        let exactEntitiesScanned = 0
        let fragmentBuilds = 0
        let fragmentCopies = 0
        let updateGroups = 0
        let groupedProps = 0

        const getCellFragment = (cell: CacheCell) => {
            const cached = cellFragments.get(cell.key)
            if (cached) {
                return cached
            }
            if (!grid.dirtyCells.has(cell.key)) {
                return null
            }

            const buildStart = performance.now()
            const plan = createUpdatePlanForEntities(cell.entities, tick, context, cache)
            const fragment = writePlanFragment(plan, context, protocol)
            buildMs += performance.now() - buildStart
            cellFragments.set(cell.key, fragment)
            fragmentBuilds++
            return fragment
        }

        for (let userIndex = 0; userIndex < views.length; userIndex++) {
            const range = grid.viewRange(views[userIndex], config.queryPadding)
            const userFragments: CellFragment[] = []
            const userPlan = createEmptySnapshotPlan()
            const queryStart = performance.now()
            const buildBeforeQuery = buildMs

            for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
                for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                    const cell = grid.getCell(cellX, cellY)
                    if (!cell) {
                        continue
                    }
                    touchedCells++

                    if (config.spatialCacheVariant === 'cell-fragments') {
                        const fragment = getCellFragment(cell)
                        if (fragment && (fragment.updateGroups > 0 || fragment.updateProps > 0)) {
                            userFragments.push(fragment)
                        }
                        continue
                    }

                    if (config.spatialCacheVariant === 'interior-fragments' && grid.cellIsInterior(cellX, cellY, range)) {
                        interiorCells++
                        const fragment = getCellFragment(cell)
                        if (fragment && (fragment.updateGroups > 0 || fragment.updateProps > 0)) {
                            userFragments.push(fragment)
                        }
                        continue
                    }

                    edgeCells++
                    exactEntitiesScanned += cell.entities.length
                    const edgePlan = createUpdatePlanForEntities(cell.entities, tick, context, cache, range)
                    userPlan.updateEntityGroups.push(...edgePlan.updateEntityGroups)
                    userPlan.updateEntities.push(...edgePlan.updateEntities)
                }
            }

            queryMs += performance.now() - queryStart - (buildMs - buildBeforeQuery)

            const writeStart = performance.now()
            if (config.spatialCacheVariant === 'current-exact' ||
                (config.spatialCacheVariant === 'interior-fragments' && userPlan.updateEntityGroups.length > 0)) {
                const fragment = writePlanFragment(userPlan, context, protocol)
                tickBytes += fragment.bytes
                updateGroups += fragment.updateGroups
                groupedProps += fragment.groupedProps
            }
            writeMs += performance.now() - writeStart

            if (userFragments.length > 0) {
                const copyStart = performance.now()
                tickBytes += writeCopiedFragments(userFragments)
                copyMs += performance.now() - copyStart
                fragmentCopies += userFragments.length
                for (let i = 0; i < userFragments.length; i++) {
                    updateGroups += userFragments[i].updateGroups
                    groupedProps += userFragments[i].groupedProps
                }
            }
        }

        const stepMs = performance.now() - tickStart
        cache.deleteCachesForTick(tick)

        if (measure) {
            indexTimes.push(indexMs)
            stepTimes.push(stepMs)
            queryTimes.push(queryMs)
            fragmentBuildTimes.push(buildMs)
            writeTimes.push(writeMs)
            copyTimes.push(copyMs)
            bytesTotal += tickBytes
            touchedCellsTotal += touchedCells
            interiorCellsTotal += interiorCells
            edgeCellsTotal += edgeCells
            exactEntitiesScannedTotal += exactEntitiesScanned
            fragmentBuildsTotal += fragmentBuilds
            fragmentCopiesTotal += fragmentCopies
            updateGroupsTotal += updateGroups
            groupedPropsTotal += groupedProps
        }
    }

    for (let i = 0; i < config.warmup; i++) {
        runTick(i + 1, false)
    }
    for (let i = 0; i < config.ticks; i++) {
        runTick(i + config.warmup + 1, true)
    }

    const snapshots = config.users * config.ticks
    const stepSummary = summarize(stepTimes)
    const indexSummary = summarize(indexTimes)
    const querySummary = summarize(queryTimes)
    const buildSummary = summarize(fragmentBuildTimes)
    const writeSummary = summarize(writeTimes)
    const copySummary = summarize(copyTimes)
    const result = {
        scenario: config.scenario,
        spatialCacheVariant: config.spatialCacheVariant,
        users: config.users,
        entities: config.entities,
        ticks: config.ticks,
        warmup: config.warmup,
        groups: config.groups,
        cellSize: config.cellSize,
        viewHalf: fmt(config.viewHalf),
        spatialDistribution: config.spatialDistribution,
        worldSize: config.worldSize,
        clusters: config.clusters,
        moveFraction: config.moveFraction,
        queryPadding: config.queryPadding,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        stepMs: {
            avg: fmt(stepSummary.avg),
            p50: fmt(stepSummary.p50),
            p95: fmt(stepSummary.p95),
            max: fmt(stepSummary.max)
        },
        indexMs: {
            avg: fmt(indexSummary.avg),
            p50: fmt(indexSummary.p50),
            p95: fmt(indexSummary.p95),
            max: fmt(indexSummary.max)
        },
        stepPlusIndexMs: {
            avg: fmt(stepSummary.avg + indexSummary.avg),
            p50: fmt(stepSummary.p50 + indexSummary.p50),
            p95: fmt(stepSummary.p95 + indexSummary.p95),
            max: fmt(stepSummary.max + indexSummary.max)
        },
        queryMsPerTick: fmt(querySummary.avg),
        fragmentBuildMsPerTick: fmt(buildSummary.avg),
        writeMsPerTick: fmt(writeSummary.avg),
        copyMsPerTick: fmt(copySummary.avg),
        bytesPerSnapshot: Math.round(bytesTotal / snapshots),
        bytesPerTick: Math.round(bytesTotal / config.ticks),
        touchedCellsPerSnapshot: fmt(touchedCellsTotal / snapshots),
        interiorCellsPerSnapshot: fmt(interiorCellsTotal / snapshots),
        edgeCellsPerSnapshot: fmt(edgeCellsTotal / snapshots),
        exactEntitiesScannedPerSnapshot: fmt(exactEntitiesScannedTotal / snapshots),
        fragmentBuildsPerTick: fmt(fragmentBuildsTotal / config.ticks),
        fragmentCopiesPerSnapshot: fmt(fragmentCopiesTotal / snapshots),
        updateGroupsPerSnapshot: Math.round(updateGroupsTotal / snapshots),
        groupedPropsPerSnapshot: Math.round(groupedPropsTotal / snapshots)
    }

    console.log(JSON.stringify(result, null, 2))
}

function buildScenario(config: ScenarioConfig) {
    const context = createContext(config.groups)
    const instance = new Instance(context)
    instance.network.snapshotPerformanceEnabled = true
    instance.network.sharedUpdateFragmentsEnabled = config.sharedUpdates
    const adapter = new CountingAdapter()
    adapter.network = instance.network

    const users: User[] = []
    for (let i = 0; i < config.users; i++) {
        users.push(createUser(instance, i + 1, adapter))
    }

    const entities: any[] = []
    const ecsBundles: EcsBundle[] = []
    for (let i = 0; i < config.entities; i++) {
        if (config.entityShape === 'ecs') {
            const bundle = createEcsBundle(i)
            ecsBundles.push(bundle)
            entities.push(bundle.root)
        } else if (config.entityShape === 'monolith') {
            entities.push(createWideEntity(i))
        } else {
            entities.push(createEntity(i))
        }
    }
    if (config.scenario === 'aabb-bruteforce' ||
        config.scenario === 'aabb-grid' ||
        config.scenario === 'aabb-cell' ||
        config.scenario === 'cell-channel' ||
        config.scenario === 'mutation-cell-channel' ||
        config.scenario === 'trusted-spatial-channel' ||
        config.scenario === 'wide-trusted-spatial' ||
        config.scenario === 'ecs-trusted-spatial' ||
        config.scenario === 'ecs-spatial-channel' ||
        config.scenario === 'parent-child-cell-channel' ||
        config.scenario === 'parent-child-trusted-spatial-channel' ||
        config.scenario === 'aabb-grid-cache') {
        applySpatialDistribution(entities as TestEntity[], config)
        if (config.entityShape === 'ecs') {
            for (let i = 0; i < ecsBundles.length; i++) {
                ecsBundles[i].transform.x = ecsBundles[i].root.x
                ecsBundles[i].transform.y = ecsBundles[i].root.y
            }
        }
    }

    let updateSpatialIndex: (() => void) | null = null
    let beforeStep: (() => void) | null = null
    let mutateSet = entities
    if (config.scenario === 'sparse-visible' || config.scenario === 'non-overlap') {
        setupFixedVisible(instance, users, entities, config)
    } else if (config.scenario === 'aabb-bruteforce') {
        setupAABBBruteforce(instance, users, entities, config)
    } else if (config.scenario === 'aabb-grid') {
        updateSpatialIndex = setupAABBGrid(instance, users, entities, config)
    } else if (config.scenario === 'aabb-cell') {
        updateSpatialIndex = setupAABBCell(instance, users, entities, config)
    } else if (config.scenario === 'cell-channel') {
        updateSpatialIndex = setupCellChannel(instance, users, entities, config)
    } else if (config.scenario === 'mutation-cell-channel') {
        beforeStep = setupMutationCellChannel(instance, users, entities, config)
    } else if (config.scenario === 'channel-churn') {
        const churn = setupChannelChurn(instance, users, entities, config)
        beforeStep = churn.churn
        mutateSet = churn.liveEntities
    } else if (config.scenario === 'channel-mutation') {
        beforeStep = setupMutationChannel(instance, users, entities, config)
    } else if (config.scenario === 'trusted-channel') {
        beforeStep = setupTrustedChannel(instance, users, entities, config)
    } else if (config.scenario === 'trusted-spatial-channel') {
        beforeStep = setupTrustedSpatialChannel(instance, users, entities as TestEntity[], config)
    } else if (config.scenario === 'wide-channel') {
        beforeStep = setupWideChannel(instance, users, entities as WideEntity[], config)
    } else if (config.scenario === 'wide-trusted-channel') {
        beforeStep = setupWideTrustedChannel(instance, users, entities as WideEntity[], config)
    } else if (config.scenario === 'wide-trusted-spatial') {
        beforeStep = setupWideTrustedSpatial(instance, users, entities as WideEntity[], config)
    } else if (config.scenario === 'ecs-trusted-channel') {
        beforeStep = setupEcsTrustedChannel(instance, users, ecsBundles, config)
    } else if (config.scenario === 'ecs-channel') {
        beforeStep = setupEcsChannel(instance, users, ecsBundles, config)
    } else if (config.scenario === 'ecs-channel-churn') {
        beforeStep = setupEcsChannelChurn(instance, users, ecsBundles, config)
    } else if (config.scenario === 'ecs-trusted-spatial') {
        beforeStep = setupEcsTrustedSpatial(instance, users, ecsBundles, config)
    } else if (config.scenario === 'ecs-spatial-channel') {
        beforeStep = setupEcsSpatialChannel(instance, users, ecsBundles, config)
    } else if (config.scenario === 'parent-child-channel') {
        mutateSet = setupParentChildChannel(instance, users, entities as TestEntity[], config)
    } else if (config.scenario === 'parent-child-trusted-channel') {
        beforeStep = setupParentChildTrustedChannel(instance, users, entities as TestEntity[], config)
    } else if (config.scenario === 'parent-child-cell-channel') {
        const parentChildCell = setupParentChildCellChannel(instance, users, entities as TestEntity[], config)
        mutateSet = parentChildCell.allEntities
        updateSpatialIndex = parentChildCell.updateSpatialIndex
    } else if (config.scenario === 'parent-child-trusted-spatial-channel') {
        beforeStep = setupParentChildTrustedSpatialChannel(instance, users, entities as TestEntity[], config)
    } else {
        setupShared(instance, users as any, entities as TestEntity[])
    }

    return { instance, adapter, users, entities: mutateSet, updateSpatialIndex, beforeStep }
}

function percentile(sorted: number[], p: number) {
    if (sorted.length === 0) {
        return 0
    }
    const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
    return sorted[index]
}

function summarize(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b)
    const total = values.reduce((sum, value) => sum + value, 0)
    return {
        avg: values.length > 0 ? total / values.length : 0,
        p50: percentile(sorted, 0.50),
        p95: percentile(sorted, 0.95),
        max: sorted[sorted.length - 1] || 0
    }
}

function fmt(value: number) {
    return Number(value.toFixed(3))
}

function run() {
    const config = readConfig()
    if (config.scenario === 'aabb-grid-cache') {
        runSpatialCacheScenario(config)
        return
    }

    const { instance, adapter, entities, updateSpatialIndex, beforeStep } = buildScenario(config)
    const stepTimes: number[] = []
    const mutationTimes: number[] = []
    const indexTimes: number[] = []

    for (let i = 0; i < config.warmup; i++) {
        if (!CUSTOM_MUTATION_SCENARIOS.has(config.scenario)) {
            mutateEntities(entities, i, config.moveFraction)
        }
        if (beforeStep) {
            beforeStep()
        }
        if (updateSpatialIndex) {
            updateSpatialIndex()
        }
        instance.step()
    }

    instance.network.resetSnapshotPerformance()
    adapter.sends = 0
    adapter.bytes = 0

    for (let i = 0; i < config.ticks; i++) {
        if (!CUSTOM_MUTATION_SCENARIOS.has(config.scenario)) {
            const mutationStart = performance.now()
            mutateEntities(entities, i + config.warmup, config.moveFraction)
            mutationTimes.push(performance.now() - mutationStart)
        }
        if (beforeStep) {
            const mutationStart = performance.now()
            beforeStep()
            mutationTimes.push(performance.now() - mutationStart)
        }
        if (updateSpatialIndex) {
            const indexStart = performance.now()
            updateSpatialIndex()
            indexTimes.push(performance.now() - indexStart)
        }
        const start = performance.now()
        instance.step()
        stepTimes.push(performance.now() - start)
    }

    const summary = summarize(stepTimes)
    const mutationSummary = summarize(mutationTimes)
    const indexSummary = summarize(indexTimes)
    const perf = instance.network.snapshotPerformance
    const snapshots = perf.snapshots || 1
    const sharedBuilds = perf.sharedFragmentBuilds || 1
    const sharedSnapshots = perf.sharedSnapshots || 1
    const result = {
        scenario: config.scenario,
        entityShape: config.entityShape,
        users: config.users,
        entities: config.entities,
        rootEntities: config.entities,
        networkedEntities: config.entityShape === 'ecs' ? config.entities * 4 : config.entities * (config.children + 1),
        visible: config.visible,
        ticks: config.ticks,
        warmup: config.warmup,
        sharedUpdates: config.sharedUpdates,
        groups: config.groups,
        cellSize: config.cellSize,
        viewHalf: fmt(config.viewHalf),
        churn: config.churn,
        children: config.children,
        spatialDistribution: config.spatialDistribution,
        worldSize: config.worldSize,
        clusters: config.clusters,
        moveFraction: config.moveFraction,
        queryPadding: config.queryPadding,
        spatialCacheVariant: config.spatialCacheVariant,
        fragmentCellLimit: config.fragmentCellLimit,
        stableFragmentCellLimit: config.stableFragmentCellLimit,
        mutationMode: config.mutationMode,
        explicitMutationApi: config.explicitMutationApi,
        trustedEmitMode: config.trustedEmitMode,
        dirtyCellFullScanThreshold: config.dirtyCellFullScanThreshold,
        dirtyCellFullScanMinEntities: config.dirtyCellFullScanMinEntities,
        stepMs: {
            avg: fmt(summary.avg),
            p50: fmt(summary.p50),
            p95: fmt(summary.p95),
            max: fmt(summary.max)
        },
        mutationMs: {
            avg: fmt(mutationSummary.avg),
            p50: fmt(mutationSummary.p50),
            p95: fmt(mutationSummary.p95),
            max: fmt(mutationSummary.max)
        },
        mutationPlusStepMs: {
            avg: fmt(mutationSummary.avg + summary.avg),
            p50: fmt(mutationSummary.p50 + summary.p50),
            p95: fmt(mutationSummary.p95 + summary.p95),
            max: fmt(mutationSummary.max + summary.max)
        },
        indexMs: {
            avg: fmt(indexSummary.avg),
            p50: fmt(indexSummary.p50),
            p95: fmt(indexSummary.p95),
            max: fmt(indexSummary.max)
        },
        stepPlusIndexMs: {
            avg: fmt(summary.avg + indexSummary.avg),
            p50: fmt(summary.p50 + indexSummary.p50),
            p95: fmt(summary.p95 + indexSummary.p95),
            max: fmt(summary.max + indexSummary.max)
        },
        totalMs: {
            avg: fmt(mutationSummary.avg + summary.avg + indexSummary.avg),
            p50: fmt(mutationSummary.p50 + summary.p50 + indexSummary.p50),
            p95: fmt(mutationSummary.p95 + summary.p95 + indexSummary.p95),
            max: fmt(mutationSummary.max + summary.max + indexSummary.max)
        },
        snapshots: perf.snapshots,
        sharedSnapshots: perf.sharedSnapshots,
        sends: adapter.sends,
        bytesPerSnapshot: Math.round(perf.bytesTotal / snapshots),
        bytesPerTick: Math.round(adapter.bytes / config.ticks),
        collectMsPerSnapshot: fmt(perf.collectTotalMs / snapshots),
        countMsPerSnapshot: fmt(perf.countTotalMs / snapshots),
        writeMsPerSnapshot: fmt(perf.writeTotalMs / snapshots),
        commitMsPerSnapshot: fmt(perf.commitTotalMs / snapshots),
        sendMsPerSnapshot: fmt(perf.sendTotalMs / snapshots),
        sharedFragmentBuilds: perf.sharedFragmentBuilds,
        sharedFragmentHits: perf.sharedFragmentHits,
        sharedFragmentCollectMsPerBuild: fmt(perf.sharedFragmentCollectTotalMs / sharedBuilds),
        sharedFragmentCountMsPerBuild: fmt(perf.sharedFragmentCountTotalMs / sharedBuilds),
        sharedFragmentWriteMsPerBuild: fmt(perf.sharedFragmentWriteTotalMs / sharedBuilds),
        sharedFragmentBytesPerBuild: Math.round(perf.sharedFragmentBytesTotal / sharedBuilds),
        sharedFragmentCopyMsPerSharedSnapshot: fmt(perf.sharedFragmentCopyTotalMs / sharedSnapshots),
        sharedFragmentCopyBytesPerSharedSnapshot: Math.round(perf.sharedFragmentCopyBytesTotal / sharedSnapshots),
        sharedFragmentCopyMsPerSnapshot: fmt(perf.sharedFragmentCopyTotalMs / snapshots),
        sharedFragmentCopyBytesPerSnapshot: Math.round(perf.sharedFragmentCopyBytesTotal / snapshots),
        sharedMessageFragmentBuilds: perf.sharedMessageFragmentBuilds,
        sharedMessageFragmentHits: perf.sharedMessageFragmentHits,
        sharedMessageFragmentCountMsPerBuild: fmt(perf.sharedMessageFragmentCountTotalMs / (perf.sharedMessageFragmentBuilds || 1)),
        sharedMessageFragmentWriteMsPerBuild: fmt(perf.sharedMessageFragmentWriteTotalMs / (perf.sharedMessageFragmentBuilds || 1)),
        sharedMessageFragmentBytesPerBuild: Math.round(perf.sharedMessageFragmentBytesTotal / (perf.sharedMessageFragmentBuilds || 1)),
        sharedMessageFragmentMessagesPerBuild: Math.round(perf.sharedMessageFragmentMessagesTotal / (perf.sharedMessageFragmentBuilds || 1)),
        sharedMessageFragmentCopyMsPerSnapshot: fmt(perf.sharedMessageFragmentCopyTotalMs / snapshots),
        messagesPerSnapshot: Math.round(perf.messagesTotal / snapshots),
        messagesMaxPerSnapshot: perf.messagesMax,
        engineMessagesPerSnapshot: Math.round(perf.engineMessagesTotal / snapshots),
        responsesPerSnapshot: Math.round(perf.responsesTotal / snapshots),
        createsPerSnapshot: Math.round(perf.createsTotal / snapshots),
        updatePropsPerSnapshot: Math.round(perf.updatePropsTotal / snapshots),
        updateGroupsPerSnapshot: Math.round(perf.updateGroupsTotal / snapshots),
        groupedPropsPerSnapshot: Math.round(perf.groupedUpdatePropsTotal / snapshots),
        deletesPerSnapshot: Math.round(perf.deletesTotal / snapshots)
    }

    console.log(JSON.stringify(result, null, 2))
}

run()
