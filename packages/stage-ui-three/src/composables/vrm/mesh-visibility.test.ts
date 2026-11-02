import type { VRM } from '@pixiv/three-vrm'

import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'

import {
  applyVrmMeshNodeVisibility,
  getVrmMeshNodes,
  resetVrmMeshNodeVisibility,
  setVrmMeshNodeVisibility,
} from './mesh-visibility'

function mesh(name: string, materialName = name) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    0,
  ], 3))
  const result = new Mesh(geometry, new MeshBasicMaterial({ name: materialName })) as Mesh & { name: string }
  result.name = name
  return result
}

function createVrm() {
  const scene = new Group()
  const body = mesh('BaseMesh_BODY.001', 'Skin')
  const jacket = mesh('QuantumHacker_Suit.001', 'Suit')
  const duplicateA = mesh('Extra', 'Extra A')
  const duplicateB = mesh('Extra', 'Extra B')
  const collider = mesh('VRMC_springBone_collider_Body', 'Collider')

  scene.add(body, jacket, duplicateA, duplicateB, collider)
  return {
    scene,
    body,
    jacket,
    duplicateA,
    duplicateB,
    collider,
  } as unknown as VRM & {
    body: Mesh
    jacket: Mesh
    duplicateA: Mesh
    duplicateB: Mesh
    collider: Mesh
  }
}

describe('vrm mesh visibility', () => {
  it('lists renderable meshes and keeps duplicate names addressable', () => {
    const vrm = createVrm()

    expect(getVrmMeshNodes(vrm).map(node => node.id)).toEqual([
      'BaseMesh_BODY.001',
      'QuantumHacker_Suit.001',
      'Extra',
      'Extra#1',
    ])
    expect(getVrmMeshNodes(vrm)[0].materialNames).toEqual(['Skin'])
    expect(getVrmMeshNodes(vrm)[0].vertexCount).toBe(3)
  })

  it('toggles one mesh without touching the others', () => {
    const vrm = createVrm()

    expect(setVrmMeshNodeVisibility(vrm, 'QuantumHacker_Suit.001', false)).toBe(true)
    expect(vrm.jacket.visible).toBe(false)
    expect(vrm.body.visible).toBe(true)
    expect(setVrmMeshNodeVisibility(vrm, 'missing', false)).toBe(false)
  })

  it('applies saved state and resets every mesh', () => {
    const vrm = createVrm()

    applyVrmMeshNodeVisibility(vrm, {
      'BaseMesh_BODY.001': false,
      'Extra#1': false,
    })
    expect(vrm.body.visible).toBe(false)
    expect(vrm.duplicateB.visible).toBe(false)
    expect(vrm.jacket.visible).toBe(true)

    resetVrmMeshNodeVisibility(vrm)
    expect(getVrmMeshNodes(vrm).every(node => node.visible)).toBe(true)
  })
})
