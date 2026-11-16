export type VrmIdleLoopListener = (event: { action: { getClip: () => { duration: number } } }) => void

/** Keeps the active loop listener with the mixer so a cached remount can replace it. */
export const idleLoopListeners = new WeakMap<object, VrmIdleLoopListener>()
