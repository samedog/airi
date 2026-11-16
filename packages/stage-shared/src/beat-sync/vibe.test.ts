import { describe, expect, it } from 'vitest'

import { BeatSyncTempoEstimator, BeatSyncVibeTracker } from './vibe'

function silence(samples = 2048) {
  return new Uint8Array(samples).fill(128)
}

function loud(samples = 2048) {
  return new Uint8Array(samples).fill(255)
}

function spectrum(bins = 1024, value = 0) {
  return new Uint8Array(bins).fill(value)
}

describe('beat sync vibe tracker', () => {
  it('reports no energy or HIT for silence', () => {
    const tracker = new BeatSyncVibeTracker()
    const vibe = tracker.update(silence(), spectrum())

    expect(vibe.energy).toBe(0)
    expect(vibe.hit).toBe(0)
  })

  it('keeps a quiet music section below full energy', () => {
    const tracker = new BeatSyncVibeTracker()
    // About -20 dBFS, which is a quiet intro or a low monitor level.
    const music = new Uint8Array(2048).fill(141)
    let vibe = tracker.update(music, spectrum())

    for (let index = 0; index < 20; index++)
      vibe = tracker.update(music, spectrum())

    expect(vibe.energy).toBeGreaterThan(0.35)
    expect(vibe.energy).toBeLessThan(0.5)
  })

  it('applies the energy sensitivity gain', () => {
    const tracker = new BeatSyncVibeTracker()
    tracker.setEnergyGain(1.5)
    const music = new Uint8Array(2048).fill(141)
    let vibe = tracker.update(music, spectrum())

    for (let index = 0; index < 20; index++)
      vibe = tracker.update(music, spectrum())

    expect(vibe.energy).toBeGreaterThan(0.55)
  })

  it('adapts the energy range to a quiet master', () => {
    const tracker = new BeatSyncVibeTracker()
    // Quiet verse around -30 dBFS, then a louder chorus around -10 dBFS.
    const quiet = new Uint8Array(2048).fill(132)
    const loud = new Uint8Array(2048).fill(168)
    let vibe = tracker.update(quiet, spectrum())

    for (let index = 0; index < 90; index++)
      vibe = tracker.update(quiet, spectrum())
    for (let index = 0; index < 60; index++)
      vibe = tracker.update(loud, spectrum())

    expect(vibe.energy).toBeGreaterThan(0.8)
  })

  it('raises energy quickly and releases it slowly', () => {
    const tracker = new BeatSyncVibeTracker()
    let vibe = tracker.update(silence(), spectrum())

    for (let index = 0; index < 8; index++)
      vibe = tracker.update(loud(), spectrum())

    const peak = vibe.energy
    expect(peak).toBeGreaterThan(0.9)

    vibe = tracker.update(silence(), spectrum())
    expect(vibe.energy).toBeLessThan(peak)
    expect(vibe.energy).toBeGreaterThan(0.7)
  })

  it('detects a spectral transient without a level rise', () => {
    const tracker = new BeatSyncVibeTracker()
    tracker.update(silence(), spectrum())

    const vibe = tracker.update(silence(), spectrum(1024, 255))
    expect(vibe.energy).toBe(0)
    expect(vibe.hit).toBe(1)
  })

  it('handles empty and mismatched analysis buffers', () => {
    const tracker = new BeatSyncVibeTracker()

    expect(tracker.update(new Uint8Array(0), spectrum(0))).toEqual({
      energy: 0,
      hit: 0,
    })

    tracker.update(silence(), spectrum(4))
    const mismatched = tracker.update(silence(), spectrum(8, 255))

    expect(mismatched.hit).toBe(0)
  })
})

describe('beat sync tempo estimator', () => {
  function feedBeat(bpm: number, seconds = 6) {
    const estimator = new BeatSyncTempoEstimator()
    const frameMs = 33
    const frames = Math.round(seconds * 1000 / frameMs)
    const periodFrames = 60_000 / bpm / frameMs
    let snapshot = estimator.update(0)
    for (let frame = 0; frame < frames; frame++) {
      const distanceToBeat = Math.abs(frame - Math.round(frame / periodFrames) * periodFrames)
      snapshot = estimator.update(distanceToBeat < 0.5 ? 1 : 0)
    }
    return snapshot
  }

  it('reports BPM from the onset envelope', () => {
    const snapshot = feedBeat(120)

    expect(snapshot.bpm).toBeGreaterThan(112)
    expect(snapshot.bpm).toBeLessThan(128)
    expect(snapshot.bpmConfidence).toBeGreaterThan(0.5)
  })

  it('stays near mid-tempo songs', () => {
    for (const bpm of [101, 106]) {
      const snapshot = feedBeat(bpm)
      expect(snapshot.bpm).toBeGreaterThan(bpm - 8)
      expect(snapshot.bpm).toBeLessThan(bpm + 8)
    }
  })

  it('folds sub-90 tempo into the dance range', () => {
    const snapshot = feedBeat(80)

    expect(snapshot.bpm).toBeGreaterThan(152)
    expect(snapshot.bpm).toBeLessThan(168)
  })

  it('does not derive BPM from HIT timestamps', () => {
    const estimator = new BeatSyncTempoEstimator()
    estimator.noteHit(0)
    estimator.noteHit(500)

    const snapshot = estimator.update(0)
    expect(snapshot.lastHitDeltaMs).toBe(500)
    expect(snapshot.hitCount).toBe(2)
    expect(snapshot.bpm).toBe(0)
  })

  it('clears tempo after reset', () => {
    const estimator = new BeatSyncTempoEstimator()
    estimator.noteHit(0)
    estimator.noteHit(500)
    estimator.update(1)
    estimator.reset()

    expect(estimator.update(0)).toEqual({
      bpm: 0,
      bpmConfidence: 0,
      lastHitDeltaMs: 0,
      hitCount: 0,
      tempoBufferMs: 0,
    })
  })
})
