export type PlaybackCursorOptions = {
    correctionDeadbandTicks?: number;
    correctionGain?: number;
    maxCorrectionRate?: number;
    snapThresholdTicks?: number;
};
export type ResolvedPlaybackCursorOptions = Required<PlaybackCursorOptions>;
export declare function resolvePlaybackCursorOptions(options: PlaybackCursorOptions): ResolvedPlaybackCursorOptions;
export declare class PlaybackCursor {
    private options;
    private playbackTick;
    private lastSampleNow;
    constructor(options: ResolvedPlaybackCursorOptions);
    reset(): void;
    advance(availableLastTick: number, desiredBufferTicks: number, tickMs: number, now: number): number;
}
//# sourceMappingURL=PlaybackCursor.d.ts.map