import { Historian2D } from './Historian2D'
import { Historian3D } from './Historian3D'

describe.each([Historian2D, Historian3D])('%s scalar history without spatial samples', HistorianType => {
    test('records flags and scalar values independently of geometry and prunes closed intervals', () => {
        const history = new HistorianType({ retentionMs: 100 })
        history.setValue(7, 'team', 'blue', 1000)
        history.setValue(7, 'ammo', 10, 1000)
        history.setFlag(7, 'shield', true, 1000)
        history.record(1, 1000)
        history.setValue(7, 'ammo', 9, 1050)
        history.setFlag(7, 'shield', false, 1050)
        history.record(2, 1050)
        expect(history.getSpatialNearest(7, 1025)).toBeNull()
        expect(history.getValue(7, 'ammo', 1025)).toBe(10)
        expect(history.getValue(7, 'ammo', 1050)).toBe(9)
        expect(history.wasFlagActive(7, 'shield', 1025)).toBe(true)
        expect(history.wasFlagActive(7, 'shield', 1050)).toBe(false)
        history.record(3, 1200)
        expect(history.getValue(7, 'ammo', 1025)).toBeUndefined()
        expect(history.getValue(7, 'team', 1200)).toBe('blue')
        expect(history.getValue(7, 'ammo', 1200)).toBe(9)
    })
})
