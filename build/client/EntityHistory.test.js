"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EntityHistory_1 = require("./EntityHistory");
const InterpolationTestHarness_1 = require("./InterpolationTestHarness");
function entity(nid, x, label = 'a') {
    return {
        nid,
        ntype: 1,
        x,
        y: 0,
        label
    };
}
describe('EntityHistory', () => {
    it('returns cloned public states while ref lookups expose retained interpolation state', () => {
        const history = new EntityHistory_1.EntityHistory((0, InterpolationTestHarness_1.createInterpolationTestContext)());
        history.recordState(1, entity(1, 10));
        const clone = history.getEntityAtTick(1, 1);
        const ref = history.getEntityAtTickRef(1, 1);
        clone.x = 999;
        expect(ref.x).toBe(10);
        expect(history.getEntityAtTick(1, 1).x).toBe(10);
    });
    it('uses the final state recorded for a tick', () => {
        const history = new EntityHistory_1.EntityHistory((0, InterpolationTestHarness_1.createInterpolationTestContext)());
        history.recordState(1, entity(1, 10));
        history.recordDelete(1, 1);
        history.recordState(1, entity(1, 20));
        expect(history.getEntityAtTick(1, 1).x).toBe(20);
        expect(history.getStats().retainedRecords).toBe(1);
    });
    it('keeps one pre-prune record so interpolation can sample across the retention boundary', () => {
        const history = new EntityHistory_1.EntityHistory((0, InterpolationTestHarness_1.createInterpolationTestContext)());
        for (let tick = 1; tick <= 10; tick++) {
            history.recordState(tick, entity(1, tick * 10));
        }
        history.pruneBefore(6);
        expect(history.getEntityAtTick(1, 5).x).toBe(50);
        expect(history.getEntityAtTick(1, 4)).toBeNull();
        expect(history.getEntityAtTick(1, 6).x).toBe(60);
        expect(history.getStats().retainedRecords).toBe(6);
    });
    it('drops deleted timelines after they are fully outside the retained interpolation range', () => {
        const history = new EntityHistory_1.EntityHistory((0, InterpolationTestHarness_1.createInterpolationTestContext)());
        history.recordState(1, entity(1, 10));
        history.recordDelete(2, 1);
        history.pruneBefore(3);
        expect(history.getEntityAtTick(1, 3)).toBeNull();
        expect(history.getStats().timelines).toBe(0);
    });
});
