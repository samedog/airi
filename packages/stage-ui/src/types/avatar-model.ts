import type { AvatarModelReference } from '@proj-airi/core-character'
import type { VrmAnimationBindings } from '@proj-airi/stage-shared/vrm-animations'
import type { Live2DAvatarModelReference } from '@proj-airi/stage-ui-live2d/types/avatar-model'

/** Configuration placeholder for Avatar Model types without an editor contract. */
export type UnconfiguredAvatarModelReference<
  TType extends 'mmd' | 'spine' | 'tachie',
> = AvatarModelReference<TType, Record<string, never>>

/** Character-owned configuration for one VRM avatar-model reference. */
export interface VrmAvatarModelConfig {
  /** Per-emotion animation bindings, resolved through the user animation library. */
  animations?: VrmAnimationBindings
}

/** References one VRM display model from a character definition. */
export type VrmAvatarModelReference = AvatarModelReference<'vrm', VrmAvatarModelConfig>

/** Avatar Model references that the current Character format can store. */
export type CharacterAvatarModelReference
  = | Live2DAvatarModelReference
    | VrmAvatarModelReference
    | UnconfiguredAvatarModelReference<'mmd'>
    | UnconfiguredAvatarModelReference<'spine'>
    | UnconfiguredAvatarModelReference<'tachie'>
