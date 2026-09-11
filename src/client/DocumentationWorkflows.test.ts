import { readFileSync } from 'fs'
import { resolve } from 'path'
import ts from 'typescript'
import {
    Binary, ChannelType, Context, EcsWorld, EntityStore, Frame, Instance, EcsChannel2D,
    applyEcsChannelClose, applyEcsChannelFrame, createChannelHeader, defineEntitySchema, ecs, bindEcsChannel
} from '../index'
import type { Snapshot } from './Snapshot'

// Execute the actual documented handlers, not a test-owned copy of their logic.
// Surrounding game/rendering dependencies are supplied by each fixture.
function documentedHandler<TArg = Frame>(doc: string, name: string, occurrence: number, scope: Record<string, any>) {
    const markdown = readFileSync(resolve(__dirname, '../../docs/ai', doc), 'utf8')
    const functions: string[] = []
    for (const block of markdown.matchAll(/```ts\n([\s\S]*?)```/g)) {
        const source = ts.createSourceFile(doc, block[1], ts.ScriptTarget.Latest, true)
        source.statements.forEach(statement => {
            if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
                functions.push(statement.getText(source))
            }
        })
    }
    if (!functions[occurrence]) {
        throw new Error(`Missing ${doc} handler ${name} #${occurrence}`)
    }
    const javascript = ts.transpileModule(functions[occurrence], {
        compilerOptions: { target: ts.ScriptTarget.ES2020 }
    }).outputText
    return new Function(...Object.keys(scope), `${javascript}\nreturn ${name}`)(...Object.values(scope)) as (arg: TArg) => void
}

test('the canonical movement loop predicts each render duration and discards paused input time', () => {
    const predict = jest.fn()
    const clearHeldInput = jest.fn()
    const document = { hidden: false }
    const render = documentedHandler<number>('canonical-snippets.md', 'renderFrame', 0, {
        document, clearHeldInput,
        client: { network: { processNextFrame: () => undefined }, flush: () => {} },
        movementPrediction: { predict, reconcile: () => {} },
        readMoveCommand: () => ({ dx: 1 }), predictedPlayer: {},
        applyNetworkFrame: () => {}, renderLocalPlayer: () => {}, render: () => {}
    })
    for (const dt of [7, 19, 11]) render(dt)
    expect(predict).toHaveBeenCalledTimes(3)
    expect(predict.mock.calls.map(([command]) => command.dtMs)).toEqual([7, 19, 11])
    render(60000)
    expect(predict).toHaveBeenCalledTimes(3)
    document.hidden = true
    render(1000 / 144)
    expect(predict).toHaveBeenCalledTimes(3)
    expect(clearHeldInput).toHaveBeenCalledTimes(2)
    document.hidden = false
    render(1000 / 144)
    expect(predict).toHaveBeenCalledTimes(4)
})

const snippets = [
    { doc: 'plain-channels.md', name: 'applyNetworkFrame', occurrence: 0, ecs: false },
    { doc: 'ecs-channels.md', name: 'applyNetworkFrame', occurrence: 0, ecs: true }
]

test('the documented shared Transform factory and schema support binding and pose updates', () => {
    const markdown = readFileSync(resolve(__dirname, '../../docs/ai/shared-state.md'), 'utf8')
    const code = markdown.match(/```ts\n\/\/ shared\/components\/transform.ts\n([\s\S]*?)```/)![1]
    const javascript = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
    }).outputText
    const component: any = {}
    new Function('exports', 'require', javascript)(component, (name: string) => {
        if (name === 'nengi') return { Binary, ecs, defineEntitySchema }
        if (name === '../ntype') return { NType: { Transform: 1 } }
        throw new Error(`Unexpected snippet import ${name}`)
    })
    const context = new Context()
    context.register(1, component.TransformSchema)
    const world = new EcsWorld()
    const channel = new EcsChannel2D(new Instance(context).localState, 100)
    const binding = bindEcsChannel(world, channel, { context })
    const TransformNet = binding.component(component.Transform)
    const pid = binding.createEntity()
    const transform = TransformNet.addSpatial(pid, component.createTransform(0, 0, 10))
    TransformNet.mutate.groups.pose(transform, 120, 105, 0.5)
    expect(world.require(pid, component.Transform)).toMatchObject({ x: 120, y: 105, rotation: 0.5 })
    binding.removeEntity(pid)
    expect(world.hasEntity(pid)).toBe(false)
    expect(channel.hasRoot(pid)).toBe(false)
})

describe.each(snippets)('$doc handler #$occurrence', snippet => {
    it.each([
        { label: 'same channel and entity ids', nextChannel: 50, nextPid: 10 },
        { label: 'different channel and entity ids', nextChannel: 60, nextPid: 20 },
        { label: 'close without replacement', nextChannel: undefined, nextPid: undefined }
    ])('cleans up old state before applying $label', ({ nextChannel, nextPid }) => {
        const context = new Context()
        context.register(1, defineEntitySchema({ x: Binary.Float64 }))
        const store = new EntityStore(context)
        const world = new EcsWorld()
        const Player = ecs.defineComponent<{ ntype: number, pid: number, nid: number, x: number }>(1)
        const Local = ecs.defineComponent<{ ntype: number, pid: number, resource: string }>(-1)
        const channelByName = new Map<string, number>()
        const sprites = new Map<number, { destroy: () => void }>()
        const destroyed: number[] = []
        const destroyPresentation = (pid: number) => {
            // Cleanup must run while the old local resources still exist.
            expect(world.get(pid, Local)).toBeDefined()
            destroyed.push(pid)
        }
        const apply = documentedHandler(snippet.doc, snippet.name, snippet.occurrence, {
            world, channelByName, networkRoots: new Set<number>(), sprites, client: { network: { store } },
            NType: { Player: 1, YouArePlayer: 2, Impact: 3 },
            applyEcsChannelClose, applyEcsChannelFrame,
            createPlayerSprite: (entity: { nid: number }) => ({ destroy: () => destroyed.push(entity.nid) }),
            destroyPresentation, destroySpriteForPid: destroyPresentation,
            createPlayerPresentation: () => {}, markPresentationDirty: () => {},
            markSpriteDirty: () => {}, handleWorldMessage: () => {}, spawnImpactEffect: () => {}
        })
        const snapshot = (channelId?: number, pid?: number, close = false): Snapshot => ({
            serverTimeMs: 1000, confirmedCommandFrameNumber: -1,
            messages: [], createEntities: [], updateEntities: [], deleteEntities: [],
            channelCloses: close ? [{ channelId: 50 }] : [],
            channelOpens: channelId === undefined ? [] : [{
                channelId,
                header: createChannelHeader(channelId, snippet.ecs ? ChannelType.EcsChannel : ChannelType.Channel, undefined, 'world')
            }],
            channels: channelId === undefined || pid === undefined ? [] : [{
                channelId, messages: [], interpolatedMessages: [],
                createEntities: snippet.ecs ? [] : [{ nid: pid, ntype: 1, x: 42 }],
                ecsCreateEntities: snippet.ecs ? [pid] : [],
                ecsCreateComponents: snippet.ecs ? [{ nid: pid + 1, pid, ntype: 1, x: 42 }] : [],
                updateEntities: [], updateEntityGroups: [], deleteEntities: [], ecsDeleteEntities: []
            }]
        })

        apply(store.applySnapshot(snapshot(50, 10), 1))
        if (snippet.ecs) {
            world.add({ pid: 10, ntype: -1, resource: 'old renderer' })
        } else {
            expect(sprites.has(10)).toBe(true)
        }

        apply(store.applySnapshot(snapshot(nextChannel, nextPid, true), 2))

        expect(destroyed).toEqual([10])
        expect(channelByName.get('world')).toBe(nextChannel)
        if (snippet.ecs) {
            expect(world.get(10, Local)).toBeUndefined()
            expect(world.hasEntity(10)).toBe(nextPid === 10)
            if (nextPid !== undefined) {
                expect(world.require(nextPid, Player)).toMatchObject({ pid: nextPid, nid: nextPid + 1, x: 42 })
            }
        } else {
            expect(Array.from(sprites.keys())).toEqual(nextPid === undefined ? [] : [nextPid])
        }
    })
})


test('the documented ECS disconnect clears applied roots and preserves unrelated local entities', () => {
    const world = new EcsWorld()
    const Local = ecs.defineLocalComponent<{ pid: number, alive: boolean }>('cleanup-test')
    const roots = [10, 20] // Includes an empty root, with no Player component.
    roots.forEach(pid => world.createEntity(pid))
    world.add(Local.create({ pid: 10, alive: true }))
    const localPid = world.createEntity()
    world.add(Local.create({ pid: localPid, alive: true }))
    const networkRoots = new Set(roots)
    const channelByName = new Map([['world', 1]])
    const removed: number[] = []
    const clear = documentedHandler<void>('ecs-channels.md', 'clearNetworkSession', 0, {
        world, networkRoots, channelByName, connected: true,
        destroyPresentation: (pid: number) => {
            expect(world.hasEntity(pid)).toBe(true)
            removed.push(pid)
        }
    })
    clear()
    clear()
    expect(removed).toEqual(roots)
    expect(networkRoots.size).toBe(0)
    expect(channelByName.size).toBe(0)
    roots.forEach(pid => expect(world.hasEntity(pid)).toBe(false))
    expect(world.require(localPid, Local).alive).toBe(true)
})

test.each([false, true])('the ECS guide releases component presentation before replacement (replace=%s)', replace => {
    const world = new EcsWorld()
    const networkRoots = new Set<number>()
    const channelByName = new Map<string, number>()
    const order: string[] = []
    const context = new Context()
    context.register(1, defineEntitySchema({ x: Binary.Float64 }))
    const store = new EntityStore(context)
    const apply = documentedHandler('ecs-channels.md', 'applyNetworkFrame', 0, {
        world, networkRoots, channelByName, NType: { Player: 1 },
        applyEcsChannelFrame, applyEcsChannelClose,
        createPlayerPresentation: () => order.push('create'),
        destroyPresentation: () => order.push('destroy'),
        markPresentationDirty: () => {}, handleWorldMessage: () => {}
    })
    function snapshot(first: boolean): Snapshot {
        return {
            serverTimeMs: 1000, confirmedCommandFrameNumber: -1,
            messages: [], createEntities: [], updateEntities: [], deleteEntities: [],
            channelOpens: first ? [{ channelId: 50, header: createChannelHeader(50, ChannelType.EcsChannel, undefined, 'world') }] : [],
            channels: [{
                channelId: 50, messages: [], interpolatedMessages: [], createEntities: [],
                ecsCreateEntities: first ? [10] : [],
                ecsCreateComponents: first || replace ? [{ pid: 10, nid: first ? 11 : 12, ntype: 1, x: 42 }] : [],
                updateEntities: [], updateEntityGroups: [], deleteEntities: first ? [] : [11], ecsDeleteEntities: []
            }]
        }
    }
    apply(store.applySnapshot(snapshot(true), 1))
    apply(store.applySnapshot(snapshot(false), 2))
    expect(order).toEqual(replace ? ['create', 'destroy', 'create'] : ['create', 'destroy'])
    expect(world.hasEntity(10)).toBe(true)
    expect(networkRoots).toEqual(new Set([10]))
})
