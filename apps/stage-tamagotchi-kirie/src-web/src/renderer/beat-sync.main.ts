import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { StageEnvironment } from '@proj-airi/stage-shared'
import {
  beatSyncBeatSignaledInvokeEventa,
  beatSyncGetStateInvokeEventa,
  beatSyncStateChangedInvokeEventa,
  beatSyncToggleInvokeEventa,
  beatSyncUpdateVibeParametersInvokeEventa,
  beatSyncVibeSignaledInvokeEventa,
  createBeatSyncDetector,
  createContext,
} from '@proj-airi/stage-shared/beat-sync'

const context = createContext()
const signalState = defineInvoke(context, beatSyncStateChangedInvokeEventa)
const signalBeat = defineInvoke(context, beatSyncBeatSignaledInvokeEventa)
const signalVibe = defineInvoke(context, beatSyncVibeSignaledInvokeEventa)
const detector = createBeatSyncDetector({ env: StageEnvironment.Tamagotchi })

detector.on('stateChange', state =>
  void signalState(state).catch(error => console.warn('[beat-sync] Failed to signal state', error)))
detector.on('beat', event =>
  void signalBeat(event).catch(error => console.warn('[beat-sync] Failed to signal beat', error)))
detector.on('vibe', event =>
  void signalVibe(event).catch(error => console.warn('[beat-sync] Failed to signal vibe', error)))

defineInvokeHandler(context, beatSyncToggleInvokeEventa, async (request) => {
  if (request.enabled)
    await detector.startScreenCapture(request.sourceId)
  else
    detector.stop()
})
defineInvokeHandler(context, beatSyncGetStateInvokeEventa, async () => detector.state)
defineInvokeHandler(context, beatSyncUpdateVibeParametersInvokeEventa, async params => detector.updateVibeParameters(params))
