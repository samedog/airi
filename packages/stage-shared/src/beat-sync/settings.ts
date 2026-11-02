/** HIT strength that counts as a beat/dance transient. */
export const BEAT_SYNC_HIT_THRESHOLD = 0.4
/** Minimum time between accepted HIT events. */
export const BEAT_SYNC_HIT_COOLDOWN_MS = 180

/** Multiplier applied to Vibe energy before smoothing. */
export const DEFAULT_BEAT_SYNC_VIBE_ENERGY_GAIN = 1
export const MIN_BEAT_SYNC_VIBE_ENERGY_GAIN = 0.5
export const MAX_BEAT_SYNC_VIBE_ENERGY_GAIN = 2.5

/** Keeps a persisted energy gain inside the range the UI exposes. */
export function clampBeatSyncVibeEnergyGain(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return DEFAULT_BEAT_SYNC_VIBE_ENERGY_GAIN
  return Math.min(MAX_BEAT_SYNC_VIBE_ENERGY_GAIN, Math.max(MIN_BEAT_SYNC_VIBE_ENERGY_GAIN, value))
}
