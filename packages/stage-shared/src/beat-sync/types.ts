export interface BeatSyncDetectorState {
  isActive: boolean
}

/** Beat tick marker. HIT timing is consumed through the vibe stream. */
export type BeatSyncBeat = Record<string, never>

/** Slow intensity and transient strength derived from the captured audio. */
export interface BeatSyncVibe {
  /** Smoothed 0..1 loudness. */
  energy: number
  /** Decaying 0..1 transient accent. */
  punch: number
  /** Positive spectral flux, 0..1. A drum hit or strong musical change. */
  hit: number
}

export interface BeatSyncDetectorEventMap {
  stateChange: (state: BeatSyncDetectorState) => void
  beat: (e: BeatSyncBeat) => void
  vibe: (vibe: BeatSyncVibe) => void
}
