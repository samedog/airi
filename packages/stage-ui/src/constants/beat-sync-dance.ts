/** BPM at which a dance clip plays at its authored speed. */
export const BEAT_SYNC_REFERENCE_BPM = 120
export const MIN_BEAT_SYNC_DANCE_SPEED = 0.5
export const MAX_BEAT_SYNC_DANCE_SPEED = 2

/** Converts the interval between detected beats into BPM. */
export function bpmFromBeatInterval(interval: number): number | undefined {
  if (!Number.isFinite(interval) || interval <= 0)
    return undefined
  const bpm = 60 / interval
  return bpm >= 30 && bpm <= 300 ? bpm : undefined
}

/** Maps the detected BPM to the dance playback rate. */
export function beatSyncDanceSpeed(bpm: number, active: boolean): number {
  if (!active || !Number.isFinite(bpm) || bpm <= 0)
    return 1
  return Math.min(
    MAX_BEAT_SYNC_DANCE_SPEED,
    Math.max(MIN_BEAT_SYNC_DANCE_SPEED, bpm / BEAT_SYNC_REFERENCE_BPM),
  )
}
