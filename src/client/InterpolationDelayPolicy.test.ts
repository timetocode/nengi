import { AdaptiveDelayPolicy, resolveInterpolationDelayPolicyOptions } from './InterpolationDelayPolicy'

describe('InterpolationDelayPolicy', () => {
    it('normalizes adaptive options before they reach the per-frame policy path', () => {
        const options = resolveInterpolationDelayPolicyOptions({
            delay: {
                mode: 'adaptive',
                windowFrames: 1.5,
                safetyTicks: -1,
                minMs: -10,
                maxMs: -20,
                maxSampleGapMs: -1,
                decreaseStableMs: -1,
                decreaseStepMs: -1,
                stableThresholdMs: -1
            }
        }, 50)

        expect(options).toMatchObject({
            mode: 'adaptive',
            windowFrames: 2,
            safetyTicks: 0,
            minMs: 0,
            maxMs: 0,
            maxSampleGapMs: 1,
            decreaseStableMs: 0,
            decreaseStepMs: 0,
            stableThresholdMs: 0
        })
    })

    it('does not produce a delay above max when min is configured above max', () => {
        const options = resolveInterpolationDelayPolicyOptions({
            delay: {
                mode: 'adaptive',
                minMs: 100,
                maxMs: 50,
                safetyTicks: 0
            }
        }, 50)
        const policy = new AdaptiveDelayPolicy(options, 50)

        expect(options.maxMs).toBe(100)
        expect(policy.getDelayMs(0, [], 1000)).toBe(100)
    })
})
