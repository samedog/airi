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

function click(locator: { element: () => HTMLElement | SVGElement }) {
  locator.element().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function renderMenu(
  onToggle = vi.fn(),
  onReset = vi.fn(),
  onRecategorize = vi.fn(),
) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })
  return render(VrmMeshRadialMenu, {
    props: {
      open: true,
      x: 500,
      y: 400,
      nodes,
      onToggle,
      onReset,
      onRecategorize,
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

    click(screen.getByRole('button', { name: /Body/ }))
    await expect.element(screen.getByText('Choose a part')).toBeVisible()

    click(screen.getByRole('button', { name: 'BODY' }))
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'BaseMesh_BODY.001' }))
  })

  it('resets every part from the category ring', async () => {
    const onReset = vi.fn()
    const screen = renderMenu(vi.fn(), onReset)

    click(screen.getByRole('button', { name: 'Reset' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('moves a part to another category through the move picker', async () => {
    const onToggle = vi.fn()
    const onRecategorize = vi.fn()
    const screen = renderMenu(onToggle, vi.fn(), onRecategorize)

    click(screen.getByRole('button', { name: /Body/ }))
    await expect.element(screen.getByText('Choose a part')).toBeVisible()

    click(screen.getByRole('button', { name: 'Move' }))
    await expect.element(screen.getByText('Choose a part to move')).toBeVisible()

    click(screen.getByRole('button', { name: 'BODY' }))
    await expect.element(screen.getByText('Move BODY')).toBeVisible()

    click(screen.getByRole('button', { name: /Outfit/ }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(onRecategorize).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'BaseMesh_BODY.001' }),
      'outfit',
    )
  })

  it('opens the move picker when a part is right-clicked', async () => {
    const screen = renderMenu()

    click(screen.getByRole('button', { name: /Body/ }))
    await expect.element(screen.getByText('Choose a part')).toBeVisible()

    screen.getByRole('button', { name: 'BODY' }).element().dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    )
    await expect.element(screen.getByText('Move BODY')).toBeVisible()
  })

  it('returns a part to automatic classification with Auto', async () => {
    const onRecategorize = vi.fn()
    const screen = renderMenu(vi.fn(), vi.fn(), onRecategorize)

    click(screen.getByRole('button', { name: /Body/ }))
    await expect.element(screen.getByText('Choose a part')).toBeVisible()

    click(screen.getByRole('button', { name: 'Move' }))
    await expect.element(screen.getByText('Choose a part to move')).toBeVisible()

    click(screen.getByRole('button', { name: 'BODY' }))
    await expect.element(screen.getByText('Move BODY')).toBeVisible()

    click(screen.getByRole('button', { name: 'Auto' }))

    expect(onRecategorize).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'BaseMesh_BODY.001' }),
      null,
    )
  })
})
