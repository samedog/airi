import { readonly, ref } from 'vue'

/**
 * True while a karaoke song plays.
 *
 * The window that mounts `Stage.vue` owns both the song and the speech host, so
 * one flag per renderer is enough. A leaf module rather than a store: the
 * speech host reads it before it opens a stream, and a store there would make
 * the karaoke player, its audio context included, a dependency of every speech
 * call.
 */
const singing = ref(false)

export const karaokeSinging = readonly(singing)

/** The karaoke player calls this when a song starts and when it stops. */
export function setKaraokeSinging(value: boolean) {
  singing.value = value
}

/**
 * Purposes that stay quiet while she sings.
 *
 * `answer` is the reply to the owner and `notification` is a Spark reaction. A
 * `read-aloud` purpose is the owner asking for that text, so it is left alone.
 */
const SILENT_PURPOSES: ReadonlySet<string> = new Set(['answer', 'notification'])

/**
 * Whether speech of this purpose must be omitted now.
 *
 * Omitted, not queued: the producer closes instead of waiting for the last
 * note, because a reply or a notification that arrives after the song is stale
 * by the time it could be spoken.
 */
export function silentWhileSinging(purpose: string): boolean {
  return singing.value && SILENT_PURPOSES.has(purpose)
}
