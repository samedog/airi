import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useVrmAttachmentsStore } from './vrm-attachments'

describe('vrm attachments store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('imports an asset, binds it to a model, and toggles visibility', async () => {
    const store = useVrmAttachmentsStore()
    const asset = await store.importAsset(new File(['glb'], 'Cyber Eye.glb', { type: 'model/gltf-binary' }))
    const binding = store.addBinding('model-a', asset.id)

    expect(store.assets).toHaveLength(1)
    expect(store.resolveAttachments('model-a')).toEqual([
      expect.objectContaining({
        id: binding.id,
        name: 'Cyber Eye',
        visible: true,
      }),
    ])

    store.toggleBinding('model-a', binding.id)
    expect(store.resolveAttachments('model-a', false)).toEqual([])
    expect(store.resolveAttachments('model-a')[0].visible).toBe(false)

    await store.removeAsset(asset.id)
    expect(store.assets).toEqual([])
    expect(store.getBindings('model-a')).toEqual([])
  })
})
