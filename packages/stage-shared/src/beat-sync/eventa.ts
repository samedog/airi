import type { InvocableEventContext } from '@moeru/eventa'

import type { BeatSyncToggleRequest } from './audio-capture'
import type { BeatSyncBeat, BeatSyncDetectorState, BeatSyncVibe } from './types'

import { createContext as createWebContext, defineInvokeEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'

import { isElectronWindow } from '../window'

// Functions
export const beatSyncToggleInvokeEventa = defineInvokeEventa<void, BeatSyncToggleRequest>('eventa:invoke:electron:beat-sync:toggle')
export const beatSyncGetStateInvokeEventa = defineInvokeEventa<BeatSyncDetectorState>('eventa:invoke:electron:beat-sync:get-state')
export const beatSyncUpdateVibeParametersInvokeEventa = defineInvokeEventa<void, { energyGain?: number }>('eventa:event:electron:beat-sync:update-vibe-parameters')

// Events
export const beatSyncStateChangedInvokeEventa = defineInvokeEventa<void, BeatSyncDetectorState>('eventa:event:electron:beat-sync:state-changed')
export const beatSyncBeatSignaledInvokeEventa = defineInvokeEventa<void, BeatSyncBeat>('eventa:event:electron:beat-sync:beat-signaled')
export const beatSyncVibeSignaledInvokeEventa = defineInvokeEventa<void, BeatSyncVibe>('eventa:event:electron:beat-sync:vibe-signaled')

let broadcastChannel: BroadcastChannel | undefined
function getBroadcastChannel() {
  broadcastChannel ??= new BroadcastChannel('airi::beat-sync')
  return broadcastChannel
}

export function createContext(): InvocableEventContext<unknown, { raw?: unknown }> {
  if (isElectronWindow(window)) {
    return createBroadcastChannelContext(getBroadcastChannel()).context as InvocableEventContext<unknown, { raw?: unknown }>
  }
  else {
    return createWebContext()
  }
}
