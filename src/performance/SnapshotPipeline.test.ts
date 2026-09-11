import { ClientNetwork } from '../client/ClientNetwork'
import { Channel } from '../server/channel/Channel'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { buildScenario, readConfig, runScenario, summarizeSnapshotTimings } from './SnapshotPipeline.performance'

describe('snapshot performance workloads', () => {
    const originalEnvironment = process.env
    beforeEach(() => {
        process.env = Object.fromEntries(Object.entries(originalEnvironment).filter(([key]) => !key.startsWith('PROFILE_')))
    })
    afterEach(() => { process.env = originalEnvironment })

    const structuralCases = (['ecs-channel-2d', 'ecs-channel-3d'] as const).flatMap(scenario =>
        [false, true].flatMap(sharedUpdates => (['roots', 'components'] as const).flatMap(ecsChurn =>
            (['before-writes', 'after-writes', 'materialized'] as const).map(order => ({ scenario, sharedUpdates, ecsChurn, order })))))

    it.each(structuralCases)('decodes spatial churn: $scenario shared=$sharedUpdates $ecsChurn $order', options => {
        const config = { ...readConfig(options.scenario), ...options,
            users: 2, entities: 8, churn: 3, spatialDistribution: 'single-cell', cellSize: 512, viewHalf: 1024,
            ecsChurnOrder: options.order === 'before-writes' ? 'before-writes' as const : 'after-writes' as const,
            ecsMaterialize: options.order === 'materialized' }
        const { instance, adapter, users, beforeStep } = buildScenario(config)
        const channel = [...users[0].subscriptions.values()][0] as any
        const clients = users.map(() => new ClientNetwork({
            context: instance.context, serverTickRate: 20,
            predictor: { getErrors: () => ({ entities: new Map() }), cleanUp: () => {} }
        } as any))
        const payloads = new Map<number, Buffer>()
        adapter.send = (user, payload) => { payloads.set(user.id, payload) }
        let previousNids = new Set<number>()
        for (let tick = 0; tick < 8; tick++) {
            beforeStep!()
            const liveNids = new Set<number>(channel.componentNids)
            if (tick > 0) {
                const removed = [...previousNids].filter(nid => !liveNids.has(nid))
                expect(removed.length).toBe(options.ecsChurn === 'roots' ? 9 : 3)
            }
            instance.step()
            for (let i = 0; i < clients.length; i++) {
                clients[i].readSnapshotUnsafe(testBinaryAdapter.createReader(payloads.get(users[i].id)!))
                expect(clients[i].processNextFrame()).toBeDefined()
                expect(new Set(clients[i].store.entities.keys())).toEqual(liveNids)
                expect(new Set(clients[i].store.ecsEntities.keys())).toEqual(new Set(channel.rootNids))
                for (const nid of liveNids) {
                    const expected = channel.getComponent(nid)
                    const actual = clients[i].store.get(nid)!
                    for (const key of Object.keys(expected)) {
                        if (typeof expected[key] === 'number') expect(actual[key]).toBeCloseTo(expected[key], 3)
                        else expect(actual[key]).toEqual(expected[key])
                    }
                }
            }
            expect(channel.rootNids.length).toBe(8)
            expect(channel.componentNids.length).toBe(24)
            expect(instance.localState.nidPool.deferredIds.size).toBe(0)
            previousNids = liveNids
        }
    })

    it.each(['sparse-visible', 'non-overlap'] as const)('decodes the intended visible sets in %s using real channels', scenario => {
        for (const shared of [false, true]) {
            const config = { ...readConfig(scenario), users: 3, entities: 20, visible: 4, sharedUpdates: shared }
            const { instance, adapter, users, entities } = buildScenario(config)
            const clients = users.map(() => new ClientNetwork({
                context: instance.context,
                serverTickRate: 20,
                predictor: { getErrors: () => ({ entities: new Map() }), cleanUp: () => {} }
            } as any))
            const payloads = new Map<number, Buffer>()
            adapter.send = (user, payload) => { payloads.set(user.id, payload) }
            const expectedSets = users.map((_user, i) => entities.slice(scenario === 'non-overlap' ? i * 4 : 0, scenario === 'non-overlap' ? i * 4 + 4 : 4))
            for (const user of users) {
                expect(user.subscriptions.size).toBe(1)
                expect([...user.subscriptions.values()][0]).toBeInstanceOf(Channel)
            }
            instance.step()
            for (let i = 0; i < clients.length; i++) {
                clients[i].readSnapshot(testBinaryAdapter.createReader(payloads.get(users[i].id)!))
                clients[i].processNextFrame()
                expect([...clients[i].store.entities.keys()].sort((a, b) => a - b)).toEqual(expectedSets[i].map(entity => entity.nid))
            }

            // Change the whole world, including entities no user can observe.
            // Only subscribed entities should be diffed and delivered.
            const diff = jest.spyOn(instance.cache, 'getAndDiffGrouped')
            for (const entity of entities) entity.x += 100
            instance.step()
            const expectedNids = new Set(expectedSets.flat().map(entity => entity.nid))
            expect(new Set(diff.mock.calls.map(call => call[1].nid))).toEqual(expectedNids)
            for (let i = 0; i < clients.length; i++) {
                clients[i].readSnapshot(testBinaryAdapter.createReader(payloads.get(users[i].id)!))
                clients[i].processNextFrame()
                for (const entity of expectedSets[i]) expect(clients[i].store.get(entity.nid)?.x).toBe(entity.x)
                expect(clients[i].store.entities.size).toBe(4)
            }
        }
    })

    it('rejects overlapping non-overlap configurations instead of wrapping entity indices', () => {
        process.env.PROFILE_USERS = '3'
        process.env.PROFILE_ENTITIES = '10'
        expect(readConfig('non-overlap').visible).toBe(3)
        process.env.PROFILE_VISIBLE = '4'
        expect(() => readConfig('non-overlap')).toThrow('PROFILE_ENTITIES >= PROFILE_USERS * PROFILE_VISIBLE')
    })

    it('computes combined percentiles from matching ticks rather than adding stage percentiles', () => {
        const step = Array(20).fill(0)
        const pre = Array(20).fill(0)
        const index = Array(20).fill(0)
        step[0] = 100
        pre[1] = 100
        index[2] = 100
        const timing = summarizeSnapshotTimings(step, pre, index)
        expect(timing.stepMs.p95).toBe(0)
        expect(timing.preStepMs.p95).toBe(0)
        expect(timing.indexMs.p95).toBe(0)
        expect(timing.totalMs).toEqual({ avg: 15, p50: 0, p95: 100, max: 100 })
        expect(timing.preStepPlusStepMs).toEqual({ avg: 10, p50: 0, p95: 100, max: 100 })
        expect(timing.stepPlusIndexMs).toEqual({ avg: 10, p50: 0, p95: 100, max: 100 })
    })

    it.each(['sparse-visible', 'non-overlap', 'manual-channel-2d'] as const)('runs %s with finite combined statistics', scenario => {
        const result = runScenario({ ...readConfig(scenario), users: 2, entities: 20, visible: 4, warmup: 1, ticks: 3 })
        expect(result.sends).toBe(6)
        expect(result.snapshots).toBe(6)
        expect(Number.isFinite(result.totalMs.p95)).toBe(true)
        expect(result.totalMs.p95).toBeGreaterThanOrEqual(result.stepMs.p95)
        expect(result.totalMs.max).toBeGreaterThanOrEqual(result.stepPlusIndexMs.max)
    })
})
