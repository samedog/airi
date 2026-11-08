import type { VRM } from '@pixiv/three-vrm'
import type { VrmResolvedAttachment } from '@proj-airi/stage-shared/vrm-attachments'

import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { createVrmAttachmentRuntime } from './attachments'

vi.mock('./loader', () => ({
  useVRMLoader: () => ({
    loadAsync: vi.fn(async () => ({ scene: new Group(), userData: {} })),
  }),
}))

function fakeVrm() {
  const scene = new Group()
  const body = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  body.name = 'BaseMesh_BODY.001'
  scene.add(body)
  const head = new Group()
  const humanoid = { getRawBoneNode: vi.fn((bone: string) => bone === 'head' ? head : null) }
  return { vrm: { scene, humanoid } as unknown as VRM, head, body }
}

const attachment: VrmResolvedAttachment = {
  id: 'eye',
  assetId: 'asset',
  name: 'Cyber Eye',
  format: 'glb',
  url: 'blob:eye',
  bone: 'head',
  transform: {
    position: [0, 0.1, 0],
    rotation: [0, 90, 0],
    scale: 0.5,
  },
  visible: true,
  hideMeshIds: ['BaseMesh_BODY.001'],
}

describe('vrm attachments', () => {
  it('attaches a visible asset to its bone and applies the transform', async () => {
    const { vrm, head, body } = fakeVrm()
    const runtime = createVrmAttachmentRuntime()

    await runtime.apply(vrm, [attachment])

    expect(head.children).toHaveLength(1)
    expect(head.children[0].position.toArray()).toEqual([0, 0.1, 0])
    expect(head.children[0].scale.x).toBe(0.5)
    expect(body.visible).toBe(false)
    runtime.dispose()
  })

  it('removes hidden attachments and restores masked meshes', async () => {
    const { vrm, head, body } = fakeVrm()
    const runtime = createVrmAttachmentRuntime()

    await runtime.apply(vrm, [attachment])
    await runtime.apply(vrm, [{ ...attachment, visible: false }])

    expect(head.children).toHaveLength(0)
    expect(body.visible).toBe(true)
    runtime.dispose()
  })
})
