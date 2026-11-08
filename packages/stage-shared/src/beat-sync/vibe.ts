import type { BeatSyncVibe } from './types'

import { clampBeatSyncVibeEnergyGain } from './settings'

/** Audio below this level maps to zero energy. */
const MIN_DB = -40
/** Audio above this level maps to full energy. */
const MAX_DB = -5
/** Perceptual curve: quiet material stays low, full-band material still reaches the top. */
const ENERGY_GAMMA = 1.5
/** Fast attack keeps drops responsive. */
const ENERGY_ATTACK = 0.45
/** Slow release avoids a flickering meter between beats. */
const ENERGY_RELEASE = 0.08
/** Baseline used to find rising energy. */
const SLOW_ENERGY = 0.03
/** Frequency flux below this value is noise. */
const FLUX_FLOOR = 0.004
/** Frequency flux above this value is a full punch. */
const FLUX_RANGE = 0.06
/** Energy rise below this value is ignored. */
const DELTA_FLOOR = 0.04
/** Energy rise above this value is a full punch. */
const DELTA_RANGE = 0.16
/** Minimum candidate strength for a punch. */
const PUNCH_THRESHOLD = 0.35
/** Two punches closer than this share one accent. */
const PUNCH_COOLDOWN_MS = 200
/** Punch envelope decay per update. */
const PUNCH_DECAY = 0.84

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

/**
 * Turns time-domain level and frequency frames into display-friendly vibe.
 *
 * Energy is intentionally slow. Punch is a short envelope that catches level
 * jumps and spectral transients, with a cooldown so one drum hit does not
 * retrigger on consecutive analysis frames.
 */
export class BeatSyncVibeTracker {
  private energy = 0
  private slowEnergy = 0
  private punch = 0
  private energyGain = 1
  private lastPunchAt = Number.NEGATIVE_INFINITY
  private previousFrequency: Uint8Array<ArrayBuffer> | undefined

  setEnergyGain(gain: number) {
    this.energyGain = clampBeatSyncVibeEnergyGain(gain)
  }

  reset() {
    this.energy = 0
    this.slowEnergy = 0
    this.punch = 0
    this.lastPunchAt = Number.NEGATIVE_INFINITY
    this.previousFrequency = undefined
  }

  update(
    timeDomain: Uint8Array<ArrayBuffer>,
    frequency: Uint8Array<ArrayBuffer>,
    now: number,
  ): BeatSyncVibe {
    const targetEnergy = Math.min(1, this.energyFromTimeDomain(timeDomain) ** ENERGY_GAMMA * this.energyGain)
    if (targetEnergy > this.energy)
      this.energy += (targetEnergy - this.energy) * ENERGY_ATTACK
    else
      this.energy += (targetEnergy - this.energy) * ENERGY_RELEASE

    this.slowEnergy += (this.energy - this.slowEnergy) * SLOW_ENERGY

    const flux = this.spectralFlux(frequency)
    const energyRise = clamp01((this.energy - this.slowEnergy - DELTA_FLOOR) / DELTA_RANGE)
    const punchCandidate = Math.max(energyRise, flux)

    this.punch *= PUNCH_DECAY
    if (punchCandidate >= PUNCH_THRESHOLD && now - this.lastPunchAt >= PUNCH_COOLDOWN_MS) {
      this.punch = Math.max(this.punch, punchCandidate)
      this.lastPunchAt = now
    }

    return {
      energy: this.energy,
      punch: this.punch,
      hit: flux,
    }
  }

  private energyFromTimeDomain(timeDomain: Uint8Array<ArrayBuffer>) {
    if (timeDomain.length === 0)
      return 0

    let sumSquares = 0
    for (const value of timeDomain) {
      const sample = (value - 128) / 128
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / timeDomain.length)
    const db = 20 * Math.log10(rms + 1e-9)
    return clamp01((db - MIN_DB) / (MAX_DB - MIN_DB))
  }

  private spectralFlux(frequency: Uint8Array<ArrayBuffer>) {
    if (frequency.length === 0)
      return 0

    let flux = 0
    if (this.previousFrequency && this.previousFrequency.length === frequency.length) {
      for (let index = 0; index < frequency.length; index++) {
        const delta = frequency[index] - this.previousFrequency[index]
        if (delta > 0)
          flux += delta
      }
    }

    if (!this.previousFrequency || this.previousFrequency.length !== frequency.length)
      this.previousFrequency = new Uint8Array(frequency.length)
    this.previousFrequency.set(frequency)

    const normalized = flux / frequency.length / 255
    return clamp01((normalized - FLUX_FLOOR) / FLUX_RANGE)
  }
}
