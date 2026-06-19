"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const GameEcsWorld_1 = require("./GameEcsWorld");
const Position = (0, GameEcsWorld_1.componentType)(1, 'Position');
const Velocity = (0, GameEcsWorld_1.componentType)(2, 'Velocity');
const LocalMarker = (0, GameEcsWorld_1.localComponentType)('LocalMarker');
describe('GameEcsWorld', () => {
    it('uses one local id pool for entity ids and component nids', () => {
        const ecs = new GameEcsWorld_1.GameEcsWorld();
        const pid = ecs.createEntity();
        const marker = ecs.add(LocalMarker.create({ pid, label: 'local' }));
        expect(pid).toBe(-1);
        expect(marker.nid).toBe(-2);
        expect(ecs.getByNid(marker.nid)).toBe(marker);
        expect(ecs.componentOwner(marker.nid)).toBe(pid);
        expect(ecs.componentNtype(marker.nid)).toBe(LocalMarker.ntype);
        expect(ecs.componentNidsForEntity(pid)).toEqual([marker.nid]);
    });
    it('queries entities by component composition', () => {
        const ecs = new GameEcsWorld_1.GameEcsWorld();
        const moving = ecs.createEntity();
        const staticEntity = ecs.createEntity();
        ecs.add(Position.create({ pid: moving, nid: 10, x: 1, y: 2 }));
        ecs.add(Velocity.create({ pid: moving, nid: 11, x: 3, y: 4 }));
        ecs.add(Position.create({ pid: staticEntity, nid: 12, x: 8, y: 9 }));
        const seen = [];
        ecs.query(Position, Velocity).all((pid, position, velocity) => {
            seen.push([pid, position.x, velocity.x]);
        });
        expect(seen).toEqual([[moving, 1, 3]]);
    });
});
