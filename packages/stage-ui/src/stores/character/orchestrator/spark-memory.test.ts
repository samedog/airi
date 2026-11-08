import type { MemoryEntry } from '../../../types/memory'
import type { SparkMemoryPluginOptions, SparkMemorySource } from './spark-memory'

import { describe, expect, it, vi } from 'vitest'

import { createSparkMemoryPlugin, createSparkMemorySession } from './spark-memory'

function entry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'entry-id',
    description: 'A lasting fact.',
    body: 'The fact.',
    persona: 'aluqah',
    updatedAt: 0,
    ...overrides,
  }
}

function memorySource(overrides: Partial<SparkMemorySource> = {}): SparkMemorySource {
  return {
    enabled: true,
    ready: vi.fn(async () => {}),
    indexFor: vi.fn(() => 'Your own:\n- entry-id: A lasting fact.'),
    read: vi.fn(() => entry()),
    write: vi.fn(async (input, persona) => entry({ ...input, persona })),
    forget: vi.fn(async () => true),
    ...overrides,
  }
}

function options(overrides: Partial<SparkMemoryPluginOptions> = {}): SparkMemoryPluginOptions {
  return {
    memory: memorySource(),
    activeCardId: () => 'aluqah',
    ...overrides,
  }
}

const call = { messages: [], toolCallId: 'call' }

describe('spark memory plugin', () => {
  it('exposes memory tools and the persona index when tools are supported', async () => {
    const memory = memorySource()
    const session = await createSparkMemorySession({
      ...options({ memory }),
      supportsTools: true,
    })

    expect(memory.ready).toHaveBeenCalledOnce()
    expect(memory.indexFor).toHaveBeenCalledWith('aluqah')
    expect(session?.systemInstructions?.[0]).toContain('Memory index:')
    expect(session?.tools?.map(tool => tool.function.name)).toEqual([
      'builtIn_readMemory',
      'builtIn_writeMemory',
      'builtIn_forgetMemory',
    ])
  })

  it('does nothing when memory is disabled', async () => {
    const memory = memorySource({ enabled: false })
    const session = await createSparkMemorySession({
      ...options({ memory }),
      supportsTools: true,
    })

    expect(session).toBeUndefined()
    expect(memory.ready).not.toHaveBeenCalled()
  })

  it('does nothing when the provider does not support tools', async () => {
    const memory = memorySource()
    const session = await createSparkMemorySession({
      ...options({ memory }),
      supportsTools: false,
    })

    expect(session).toBeUndefined()
    expect(memory.ready).not.toHaveBeenCalled()
  })

  it('uses default when no card is active', async () => {
    const memory = memorySource()
    await createSparkMemorySession({
      ...options({ memory, activeCardId: () => undefined }),
      supportsTools: true,
    })

    expect(memory.indexFor).toHaveBeenCalledWith('default')
  })

  it('waits for memory to load before reading the index', async () => {
    let resolveReady: (() => void) | undefined
    const memory = memorySource({
      ready: vi.fn(() => new Promise<void>((resolve) => {
        resolveReady = resolve
      })),
    })

    const pending = createSparkMemorySession({
      ...options({ memory }),
      supportsTools: true,
    })

    await Promise.resolve()
    expect(memory.indexFor).not.toHaveBeenCalled()
    resolveReady?.()
    await pending
    expect(memory.indexFor).toHaveBeenCalledOnce()
  })

  it('does not write during preparation', async () => {
    const memory = memorySource()
    await createSparkMemorySession({
      ...options({ memory }),
      supportsTools: true,
    })

    expect(memory.write).not.toHaveBeenCalled()
  })

  it('binds memory tools to the active persona', async () => {
    const memory = memorySource()
    const session = await createSparkMemorySession({
      ...options({ memory }),
      supportsTools: true,
    })
    const write = session?.tools?.[1]
    const read = session?.tools?.[0]
    const forget = session?.tools?.[2]

    await write!.execute({ entries: [{ id: null, description: 'New fact.', body: 'Body.' }] }, call)
    await read!.execute({ ids: ['entry-id'] }, call)
    await forget!.execute({ id: 'entry-id' }, call)

    expect(memory.write).toHaveBeenCalledWith({
      id: undefined,
      description: 'New fact.',
      body: 'Body.',
    }, 'aluqah')
    expect(memory.read).toHaveBeenCalledWith('entry-id', 'aluqah')
    expect(memory.forget).toHaveBeenCalledWith('entry-id', 'aluqah')
  })

  it('passes the turn tool policy into the session', async () => {
    const memory = memorySource()
    const plugin = createSparkMemoryPlugin(options({ memory }))

    const session = await plugin.prepare({
      policy: { supportsTools: true },
    } as Parameters<typeof plugin.prepare>[0])

    expect(session?.tools).toHaveLength(3)
    expect(memory.ready).toHaveBeenCalledOnce()
  })
})
