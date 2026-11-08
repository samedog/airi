/** Default number of HIT intervals used by the dance pulse. */
export const DEFAULT_BEAT_SYNC_HIT_WINDOW = 12
export const MIN_BEAT_SYNC_HIT_WINDOW = 4
export const MAX_BEAT_SYNC_HIT_WINDOW = 32
/** HITs per second that map to the authored dance speed. */
export const BEAT_SYNC_HIT_REFERENCE_RATE = 2
export const MIN_BEAT_SYNC_PULSE_SPEED = 0.5
export const MAX_BEAT_SYNC_PULSE_SPEED = 2

/** Keeps a persisted HIT window inside the range the UI exposes. */
export function clampBeatSyncHitWindow(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return DEFAULT_BEAT_SYNC_HIT_WINDOW
  return Math.min(MAX_BEAT_SYNC_HIT_WINDOW, Math.max(MIN_BEAT_SYNC_HIT_WINDOW, Math.round(value)))
}

/**
 * Estimates HIT rate from the timestamps of the last N HITs.
 *
 * This is deliberately not a BPM conversion. Few HITs over a long span mean a
 * slow sway; many HITs over a short span mean a fast chorus.
 */
export function dancePulseRate(
  hitTimes: readonly number[],
  now: number,
): number | undefined {
  if (hitTimes.length < 2)
    return undefined
  const span = Math.max(1e-6, now - hitTimes[0])
  return (hitTimes.length - 1) / span
}

/** Maps HIT rate to a dance speed. */
export function dancePulseTargetSpeed(rate: number | undefined): number {
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0)
    return MIN_BEAT_SYNC_PULSE_SPEED
  return Math.min(
    MAX_BEAT_SYNC_PULSE_SPEED,
    Math.max(MIN_BEAT_SYNC_PULSE_SPEED, rate / BEAT_SYNC_HIT_REFERENCE_RATE),
  )
}
