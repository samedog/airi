export interface BeatSyncDetectorState {
  isActive: boolean
}

/** Beat tick marker. HIT timing is consumed through the vibe stream. */
export type BeatSyncBeat = Record<string, never>

/** Slow intensity and transient strength derived from the captured audio. */
export interface BeatSyncVibe {
  /** Smoothed 0..1 loudness. */
  energy: number
  /** Positive spectral flux, 0..1. A drum hit or strong musical change. */
  hit: number
  /** Median accepted-HIT interval converted to BPM; 0 until two HITs exist. */
  bpm: number
  /** 0..1 regularity of the HIT intervals. Low means the tempo is unstable. */
  bpmConfidence: number
  /** Milliseconds between the two most recent accepted HITs; 0 until two exist. */
  lastHitDeltaMs: number
  /** Accepted HITs currently retained by the tempo estimator. */
  hitCount: number
  /** Time span covered by the retained HITs, in milliseconds. */
  tempoBufferMs: number
}

export interface BeatSyncDetectorEventMap {
  stateChange: (state: BeatSyncDetectorState) => void
  beat: (e: BeatSyncBeat) => void
  vibe: (vibe: BeatSyncVibe) => void
}
