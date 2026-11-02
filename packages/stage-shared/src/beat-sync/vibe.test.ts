import { describe, expect, it } from 'vitest'

import { BeatSyncVibeTracker } from './vibe'

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
  it('reports no energy or punch for silence', () => {
    const tracker = new BeatSyncVibeTracker()
    const vibe = tracker.update(silence(), spectrum(), 0)

    expect(vibe.energy).toBe(0)
    expect(vibe.punch).toBe(0)
    expect(vibe.hit).toBe(0)
  })

  it('keeps a quiet music section below full energy', () => {
    const tracker = new BeatSyncVibeTracker()
    // About -20 dBFS, which is a quiet intro or a low monitor level.
    const music = new Uint8Array(2048).fill(141)
    let vibe = tracker.update(music, spectrum(), 0)

    for (let index = 0; index < 20; index++)
      vibe = tracker.update(music, spectrum(), (index + 1) * 33)

    expect(vibe.energy).toBeGreaterThan(0.35)
    expect(vibe.energy).toBeLessThan(0.5)
  })

  it('applies the energy sensitivity gain', () => {
    const tracker = new BeatSyncVibeTracker()
    tracker.setEnergyGain(1.5)
    const music = new Uint8Array(2048).fill(141)
    let vibe = tracker.update(music, spectrum(), 0)

    for (let index = 0; index < 20; index++)
      vibe = tracker.update(music, spectrum(), (index + 1) * 33)

    expect(vibe.energy).toBeGreaterThan(0.55)
  })

  it('raises energy quickly and releases it slowly', () => {
    const tracker = new BeatSyncVibeTracker()
    let now = 0
    let vibe = tracker.update(silence(), spectrum(), now)

    for (let index = 0; index < 8; index++) {
      now += 33
      vibe = tracker.update(loud(), spectrum(), now)
    }
    const peak = vibe.energy
    expect(peak).toBeGreaterThan(0.9)

    now += 33
    vibe = tracker.update(silence(), spectrum(), now)
    expect(vibe.energy).toBeLessThan(peak)
    expect(vibe.energy).toBeGreaterThan(0.7)
  })

  it('triggers one punch per cooldown window', () => {
    const tracker = new BeatSyncVibeTracker()
    tracker.update(silence(), spectrum(), 0)

    const first = tracker.update(loud(), spectrum(), 100)
    expect(first.punch).toBeGreaterThan(0.9)

    const duringCooldown = tracker.update(loud(), spectrum(), 133)
    expect(duringCooldown.punch).toBeLessThan(first.punch)

    const afterCooldown = tracker.update(loud(), spectrum(), 300)
    expect(afterCooldown.punch).toBeGreaterThan(duringCooldown.punch)
  })

  it('detects a spectral transient without a level rise', () => {
    const tracker = new BeatSyncVibeTracker()
    tracker.update(silence(), spectrum(), 0)

    const vibe = tracker.update(silence(), spectrum(1024, 255), 33)
    expect(vibe.energy).toBe(0)
    expect(vibe.punch).toBe(1)
    expect(vibe.hit).toBe(1)
  })

  it('handles empty and mismatched analysis buffers', () => {
    const tracker = new BeatSyncVibeTracker()

    expect(tracker.update(new Uint8Array(0), spectrum(0), 0)).toEqual({
      energy: 0,
      punch: 0,
      hit: 0,
    })

    tracker.update(silence(), spectrum(4), 33)
    const mismatched = tracker.update(silence(), spectrum(8, 255), 66)

    expect(mismatched.hit).toBe(0)
  })
})
