import { Historian2D } from './Historian2D'

type PlayerBody = {
    nid: number
    rawX: number
    rawY: number
    publicX: number
    publicY: number
    radius: number
    team: number
    hp?: number
    state?: string
    deathStartedAt?: number
}

function trackRaw(history: Historian2D, player: PlayerBody, timeMs = 0) {
    history.trackSpatial(player, {
        nid: 'nid',
        x: 'rawX',
        y: 'rawY',
        radius: 'radius',
        flags: 'team'
    }, timeMs)
}

function trackPublic(history: Historian2D, player: PlayerBody, timeMs = 0) {
    history.trackSpatial(player, {
        nid: 'nid',
        x: 'publicX',
        y: 'publicY',
        radius: 'radius',
        flags: 'team'
    }, timeMs)
}

function closestEnemyHit(history: Historian2D, timeMs: number, shooter: PlayerBody, targetX: number, targetY: number) {
    return history.queryRayNearest(timeMs, shooter.rawX, shooter.rawY, targetX, targetY)
        .find(hit => hit.sample.nid !== shooter.nid && hit.sample.flags !== shooter.team) || null
}

describe('Historian2D gameplay policy sketches', () => {
    it('supports traditional attacker-time hitscan rewind without owning the damage policy', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const shooter = { nid: 1, rawX: 0, rawY: 0, publicX: 0, publicY: 0, radius: 12, team: 1 }
        const target = { nid: 2, rawX: 100, rawY: 0, publicX: 100, publicY: 0, radius: 12, team: 2 }
        trackRaw(history, shooter)
        trackRaw(history, target)
        history.record(1, 100)

        target.rawY = 40
        history.record(2, 150)

        const shotTimeMs = 100
        const nowTimeMs = 150

        expect(closestEnemyHit(history, shotTimeMs, shooter, 140, 0)?.sample.nid).toBe(target.nid)
        expect(closestEnemyHit(history, nowTimeMs, shooter, 140, 0)).toBeNull()
    })

    it('supports defender-favored invulnerability by querying a different historical fact than the shot ray', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const shooter = { nid: 1, rawX: 0, rawY: 0, publicX: 0, publicY: 0, radius: 12, team: 1 }
        const target = { nid: 2, rawX: 100, rawY: 0, publicX: 100, publicY: 0, radius: 12, team: 2 }
        trackRaw(history, shooter)
        trackRaw(history, target)
        history.setFlag(target.nid, 'invulnerable', false, 0)
        history.record(1, 100)
        history.setFlag(target.nid, 'invulnerable', true, 115)
        history.record(2, 150)

        const attackerShotTimeMs = 100
        const defenderIntentTimeMs = 115
        const hit = closestEnemyHit(history, attackerShotTimeMs, shooter, 140, 0)

        const attackerFavoredDamage = !!hit && !history.wasFlagActive(target.nid, 'invulnerable', attackerShotTimeMs)
        const defenderFavoredDamage = !!hit && !history.wasFlagActive(target.nid, 'invulnerable', defenderIntentTimeMs)

        expect(attackerFavoredDamage).toBe(true)
        expect(defenderFavoredDamage).toBe(false)
    })

    it('supports peeker-compromise trades as userland policy over two valid historical shots', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const peeker = { nid: 1, rawX: 0, rawY: 0, publicX: -40, publicY: 0, radius: 12, team: 1 }
        const defender = { nid: 2, rawX: 100, rawY: 0, publicX: 100, publicY: 0, radius: 12, team: 2 }
        trackRaw(history, peeker)
        trackRaw(history, defender)
        history.record(1, 100)

        peeker.rawX = 80
        history.record(2, 140)

        const peekerShotTimeMs = 140
        const defenderReturnShotTimeMs = 170
        const tradeWindowMs = 60

        const peekerHit = closestEnemyHit(history, peekerShotTimeMs, peeker, defender.rawX, defender.rawY)
        const defenderHit = closestEnemyHit(history, peekerShotTimeMs, defender, peeker.rawX, peeker.rawY)
        const allowTrade = !!peekerHit && !!defenderHit && defenderReturnShotTimeMs - peekerShotTimeMs <= tradeWindowMs

        expect(peekerHit?.sample.nid).toBe(defender.nid)
        expect(defenderHit?.sample.nid).toBe(peeker.nid)
        expect(allowTrade).toBe(true)
    })

    it('can track public/smoothed bodies instead of raw bodies for observer-facing hit rules', () => {
        const rawHistory = new Historian2D({ retentionMs: 1000 })
        const publicHistory = new Historian2D({ retentionMs: 1000 })
        const shooter = { nid: 1, rawX: 0, rawY: 0, publicX: 0, publicY: 0, radius: 12, team: 1 }
        const target = { nid: 2, rawX: 100, rawY: 0, publicX: 100, publicY: 30, radius: 12, team: 2 }
        trackRaw(rawHistory, shooter)
        trackRaw(rawHistory, target)
        trackPublic(publicHistory, shooter)
        trackPublic(publicHistory, target)
        rawHistory.record(1, 100)
        publicHistory.record(1, 100)

        expect(closestEnemyHit(rawHistory, 100, shooter, 140, 0)?.sample.nid).toBe(target.nid)
        expect(closestEnemyHit(publicHistory, 100, shooter, 140, 0)).toBeNull()
    })

    it('can return historical samples for ids that no longer exist in current game state', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const bodiesByNid = new Map<number, PlayerBody>()
        const shooter = { nid: 1, rawX: 0, rawY: 0, publicX: 0, publicY: 0, radius: 12, team: 1 }
        const target = { nid: 2, rawX: 100, rawY: 0, publicX: 100, publicY: 0, radius: 12, team: 2 }
        bodiesByNid.set(shooter.nid, shooter)
        bodiesByNid.set(target.nid, target)
        trackRaw(history, shooter)
        trackRaw(history, target)
        history.record(1, 100)

        bodiesByNid.delete(target.nid)
        history.untrackSpatial(target.nid, 125)

        const historicalHit = closestEnemyHit(history, 100, shooter, 140, 0)
        const currentTarget = historicalHit ? bodiesByNid.get(historicalHit.sample.nid) : undefined

        expect(historicalHit?.sample.nid).toBe(target.nid)
        expect(currentTarget).toBeUndefined()
        expect(closestEnemyHit(history, 150, shooter, 140, 0)).toBeNull()
    })

    it('supports delayed deletion as userland death lifecycle rather than historian policy', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const bodiesByNid = new Map<number, PlayerBody>()
        const shooter: PlayerBody = { nid: 1, rawX: 0, rawY: 0, publicX: 0, publicY: 0, radius: 12, team: 1, hp: 100, state: 'alive' }
        const target: PlayerBody = { nid: 2, rawX: 100, rawY: 0, publicX: 100, publicY: 0, radius: 12, team: 2, hp: 5, state: 'alive' }
        bodiesByNid.set(shooter.nid, shooter)
        bodiesByNid.set(target.nid, target)
        trackRaw(history, shooter)
        trackRaw(history, target)
        history.record(1, 100)

        target.hp = 0
        target.state = 'dead'
        target.deathStartedAt = 120
        history.setValue(target.nid, 'lifeState', 'dead', 120)
        history.record(2, 150)

        const historicalHit = closestEnemyHit(history, 100, shooter, 140, 0)
        const currentTarget = historicalHit ? bodiesByNid.get(historicalHit.sample.nid) : undefined
        const canApplyNormalDamage = currentTarget?.state === 'alive'
        const canApplyTradeCredit = currentTarget?.state === 'dead' && history.getValue(target.nid, 'lifeState', 100) !== 'dead'

        expect(historicalHit?.sample.nid).toBe(target.nid)
        expect(currentTarget).toBe(target)
        expect(canApplyNormalDamage).toBe(false)
        expect(canApplyTradeCredit).toBe(true)
    })
})
