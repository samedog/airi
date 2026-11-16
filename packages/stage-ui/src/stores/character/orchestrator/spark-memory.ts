import type { SparkNotifyPlugin, SparkNotifyPluginSession } from '@proj-airi/core-agent/agents/spark-notify'

import type { MemoryEntry, MemoryWrite } from '../../../types/memory'

import { composeMemoryPrompt, createMemoryTools } from '../../../tools/memory'

/** The memory-store surface that the Spark agent needs. */
export interface SparkMemorySource {
  enabled: boolean
  ready: () => Promise<void>
  indexFor: (personaId: string) => string
  read: (id: string, personaId: string) => MemoryEntry | undefined
  write: (entry: MemoryWrite, personaId: string) => Promise<MemoryEntry | undefined>
  forget: (id: string, personaId: string) => Promise<boolean>
}

export interface SparkMemoryPluginOptions {
  memory: SparkMemorySource
  activeCardId: () => string | undefined
}

/**
 * Builds the memory session for one Spark turn.
 *
 * The model chooses whether to call a memory tool. This function only exposes
 * the tools and the persona index; it never writes during preparation.
 */
export async function createSparkMemorySession(
  options: SparkMemoryPluginOptions & { supportsTools: boolean },
): Promise<SparkNotifyPluginSession | undefined> {
  if (!options.supportsTools || !options.memory.enabled)
    return undefined

  await options.memory.ready()
  const persona = options.activeCardId() || 'default'

  return {
    systemInstructions: [composeMemoryPrompt(options.memory.indexFor(persona))],
    tools: await createMemoryTools({
      read: id => options.memory.read(id, persona),
      write: entry => options.memory.write(entry, persona),
      forget: id => options.memory.forget(id, persona),
    }),
  }
}

/** Gives Spark Notify runs the same long-term memory capability as chat runs. */
export function createSparkMemoryPlugin(options: SparkMemoryPluginOptions): SparkNotifyPlugin {
  return {
    name: 'spark-notify-memory',
    prepare: turn => createSparkMemorySession({
      ...options,
      supportsTools: turn.policy.supportsTools,
    }),
  }
}
