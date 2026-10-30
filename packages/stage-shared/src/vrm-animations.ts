import { defineInvokeEventa } from '@moeru/eventa'

/** Animation slots that one VRM avatar can bind to an imported `.vrma` file. */
export const vrmAnimationSlots = [
  'idle',
  'happy',
  'sad',
  'angry',
  'think',
  'surprised',
  'awkward',
  'question',
  'curious',
] as const

export type VrmAnimationSlot = typeof vrmAnimationSlots[number]

/** Per-avatar mapping from an emotion slot to a library asset ID. */
export type VrmAnimationBindings = Partial<Record<VrmAnimationSlot, string>>

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
