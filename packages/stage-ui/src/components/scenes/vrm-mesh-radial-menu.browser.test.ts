import type { VrmMeshNode } from '@proj-airi/stage-ui-three'

import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VrmMeshRadialMenu from './vrm-mesh-radial-menu.vue'

afterEach(() => {
  cleanup()
})

function node(id: string, category: VrmMeshNode['category']): VrmMeshNode {
  return {
    id,
    name: id,
    category,
    visible: true,
    materialNames: [],
    vertexCount: 3,
    skinned: true,
  }
}

const nodes = [
  node('BaseMesh_BODY.001', 'body'),
  node('U_Hair_3.001', 'body'),
  node('QuantumHacker_Suit.001', 'outfit'),
  node('QuantumHacker_Suit_jacket', 'outfit'),
  node('U_Accessories_2.001', 'accessories'),
]

function renderMenu(onToggle = vi.fn(), onReset = vi.fn()) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })
  return render(VrmMeshRadialMenu, {
    props: {
      open: true,
      x: 500,
      y: 400,
      nodes,
      onToggle,
      onReset,
    },
    global: { plugins: [i18n] },
  })
}

describe('vrm mesh radial menu', () => {
  it('opens a populated category and toggles one of its parts', async () => {
    const onToggle = vi.fn()
    const screen = renderMenu(onToggle)

    await expect.element(screen.getByText('Choose a category')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: /Body/ })).toBeVisible()

    const extras = screen.getByRole('button', { name: /Extras/ })
    await expect.element(extras).toBeVisible()
    await expect.element(extras).toBeDisabled()

    await screen.getByRole('button', { name: /Body/ }).click()
    await expect.element(screen.getByText('Choose a part')).toBeVisible()

    await screen.getByRole('button', { name: 'BODY' }).click()
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'BaseMesh_BODY.001' }))
  })

  it('resets every part from the category ring', async () => {
    const onReset = vi.fn()
    const screen = renderMenu(vi.fn(), onReset)

    await screen.getByRole('button', { name: 'Reset' }).click()
    expect(onReset).toHaveBeenCalledOnce()
  })
})
