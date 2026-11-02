import { defineInvokeEventa } from '@moeru/eventa'

/** Animation slots that one VRM avatar can bind to an imported `.vrma` file. */
export const vrmAnimationSlots = [
  'idle',
  'dance',
  'happy',
  'sad',
  'angry',
  'think',
  'surprised',
  'awkward',
  'question',
  'curious',
  'excited',
  'talk_calm',
  'talk_cheeky',
  'talk_upset',
] as const

export type VrmAnimationSlot = typeof vrmAnimationSlots[number]

/** Resolves an ACT motion name to a bindable slot when it names one. */
export function vrmAnimationSlotFromMotion(name: string): VrmAnimationSlot | undefined {
  const normalized = name.trim().toLowerCase()
  return vrmAnimationSlots.find(slot => slot === normalized)
}

/** Built-in energy tags offered by the animation settings UI. */
export const VRM_ANIMATION_ENERGY_CALM = 0.2
export const VRM_ANIMATION_ENERGY_MEDIUM = 0.5
export const VRM_ANIMATION_ENERGY_INTENSE = 0.78

/** One asset bound to a slot, with optional 0..1 intensity metadata. */
export interface VrmAnimationClipBinding {
  id: string
  /** Used by energy-aware slots such as dance. */
  energy?: number
}

/** Canonical bindings written by the current app. */
export type VrmAnimationBinding = VrmAnimationClipBinding[]
export type VrmAnimationBindings = Partial<Record<VrmAnimationSlot, VrmAnimationBinding>>

/** Legacy cards stored strings or arrays of strings; reads accept both shapes. */
export type VrmAnimationBindingInputEntry = string | { id?: string, energy?: number }
export type VrmAnimationBindingInput = string | VrmAnimationBindingInputEntry[]
export type VrmAnimationBindingsInput = Partial<Record<VrmAnimationSlot, VrmAnimationBindingInput>>

function clampEnergy(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return undefined
  return Math.min(1, Math.max(0, value))
}

/**
 * Normalizes one slot to an ordered, duplicate-free list of clips.
 *
 * Older cards and localStorage entries stored a single string or an array of
 * strings, so every reader goes through this function. When duplicate IDs are
 * present, the last valid energy value wins.
 */
export function normalizeVrmAnimationBinding(value: VrmAnimationBindingInput | undefined): VrmAnimationClipBinding[] {
  const candidates: unknown[] = typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value
      : []
  const clips: VrmAnimationClipBinding[] = []
  for (const candidate of candidates) {
    const source = typeof candidate === 'string'
      ? { id: candidate }
      : candidate && typeof candidate === 'object'
        ? candidate as { id?: unknown, energy?: unknown }
        : undefined
    if (!source || typeof source.id !== 'string')
      continue

    const id = source.id.trim()
    if (!id)
      continue

    const energy = clampEnergy(source.energy)
    const existing = clips.find(clip => clip.id === id)
    if (existing) {
      if (energy !== undefined)
        existing.energy = energy
      continue
    }

    clips.push(energy === undefined ? { id } : { id, energy })
  }
  return clips
}

/** Removes one asset from every slot and reports whether anything changed. */
export function removeVrmAnimationAssetFromBindings(
  bindings: VrmAnimationBindingsInput | undefined,
  assetId: string,
): { bindings: VrmAnimationBindings, changed: boolean } {
  const normalized = normalizeVrmAnimationBindings(bindings)
  const next: VrmAnimationBindings = {}
  let changed = false

  for (const slot of vrmAnimationSlots) {
    const clips = normalized[slot]
    if (!clips)
      continue

    const filtered = clips.filter(clip => clip.id !== assetId)
    if (filtered.length !== clips.length)
      changed = true
    if (filtered.length > 0)
      next[slot] = filtered
  }

  return { bindings: next, changed }
}

/** Normalizes every slot and drops empty slots and unknown keys. */
export function normalizeVrmAnimationBindings(bindings: VrmAnimationBindingsInput | undefined): VrmAnimationBindings {
  const normalized: VrmAnimationBindings = {}
  if (!bindings)
    return normalized

  for (const slot of vrmAnimationSlots) {
    const ids = normalizeVrmAnimationBinding(bindings[slot])
    if (ids.length > 0)
      normalized[slot] = ids
  }
  return normalized
}

/**
 * Picks one clip for a slot.
 *
 * A single binding always wins. With multiple bindings the previous asset is
 * excluded when possible, so two consecutive triggers never repeat the same
 * clip. `random` is injectable to keep tests deterministic.
 */
export function selectVrmAnimationClip(
  bindings: VrmAnimationBindingsInput | undefined,
  slot: VrmAnimationSlot,
  options: { previousId?: string, random?: () => number } = {},
): VrmAnimationClipBinding | undefined {
  const clips = normalizeVrmAnimationBinding(bindings?.[slot])
  if (clips.length === 0)
    return undefined
  if (clips.length === 1)
    return clips[0]

  const candidates = options.previousId
    ? clips.filter(clip => clip.id !== options.previousId)
    : clips
  const pool = candidates.length > 0 ? candidates : clips
  const random = options.random ?? Math.random
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))
  return pool[index]
}

/** Convenience wrapper for callers that only need the asset ID. */
export function selectVrmAnimationAssetId(
  bindings: VrmAnimationBindingsInput | undefined,
  slot: VrmAnimationSlot,
  options: { previousId?: string, random?: () => number } = {},
): string | undefined {
  return selectVrmAnimationClip(bindings, slot, options)?.id
}

/**
 * Returns the energy tier that an energy value selects.
 *
 * The tag is the minimum energy for that tier. For example, with tags 0.2,
 * 0.5, and 0.78, energy 0.6 selects Medium and energy 0.78 selects Intense.
 * Untagged clips act as Medium when at least one clip has an explicit tag.
 * Returns `undefined` when the slot has no explicit tags.
 */
export function selectVrmAnimationEnergyTier(
  bindings: VrmAnimationBindingsInput | undefined,
  slot: VrmAnimationSlot,
  energy: number,
): number | undefined {
  const normalized = normalizeVrmAnimationBinding(bindings?.[slot])
  if (!normalized.some(clip => clip.energy !== undefined))
    return undefined

  const clips = normalized.map(clip => clip.energy ?? VRM_ANIMATION_ENERGY_MEDIUM)
  const target = Math.min(1, Math.max(0, Number.isFinite(energy) ? energy : 0))
  const eligible = clips.filter(clipEnergy => clipEnergy <= target)
  return eligible.length > 0
    ? Math.max(...eligible)
    : Math.min(...clips)
}

/** Picks a clip by energy threshold. */
export function selectVrmAnimationClipByEnergy(
  bindings: VrmAnimationBindingsInput | undefined,
  slot: VrmAnimationSlot,
  energy: number,
  options: { previousId?: string, random?: () => number } = {},
): VrmAnimationClipBinding | undefined {
  const tierEnergy = selectVrmAnimationEnergyTier(bindings, slot, energy)
  if (tierEnergy === undefined)
    return undefined

  const normalized = normalizeVrmAnimationBinding(bindings?.[slot])
  const clips = normalized.map(clip => ({ ...clip, energy: clip.energy ?? VRM_ANIMATION_ENERGY_MEDIUM }))
  const tier = clips.filter(clip => Math.abs((clip.energy ?? 0) - tierEnergy) <= 1e-9)

  const candidates = options.previousId
    ? tier.filter(clip => clip.id !== options.previousId)
    : tier
  const pool = candidates.length > 0 ? candidates : tier
  const random = options.random ?? Math.random
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))
  return pool[index]
}

/** One user-local `.vrma` file in the desktop animation library. */
export interface VrmAnimationAsset {
  id: string
  name: string
  size: number
  importedAt: string
}

export const electronVrmAnimationsList = defineInvokeEventa<VrmAnimationAsset[]>(
  'eventa:invoke:electron:vrm-animations:list',
)

export const electronVrmAnimationImport = defineInvokeEventa<
  VrmAnimationAsset,
  { name: string, data: ArrayBuffer }
>('eventa:invoke:electron:vrm-animations:import')

export const electronVrmAnimationRead = defineInvokeEventa<ArrayBuffer, string>(
  'eventa:invoke:electron:vrm-animations:read',
)

export const electronVrmAnimationRemove = defineInvokeEventa<void, string>(
  'eventa:invoke:electron:vrm-animations:remove',
)

export const electronVrmAnimationReveal = defineInvokeEventa<void>(
  'eventa:invoke:electron:vrm-animations:reveal',
)
