import type { VRM } from '@pixiv/three-vrm'

import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'

import {
  applyVrmMeshCategoryOverrides,
  applyVrmMeshNodeVisibility,
  getVrmMeshCategory,
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
  const interactionCollider = mesh('vrm_interaction_head', 'Interaction')
  const hair = mesh('U_Hair_3.001', 'Hair')
  const accessories = mesh('U_Accessories_2.001', 'Accessories')

  scene.add(body, jacket, duplicateA, duplicateB, collider, interactionCollider, hair, accessories)
  return {
    scene,
    body,
    jacket,
    duplicateA,
    duplicateB,
    collider,
    interactionCollider,
    hair,
    accessories,
  } as unknown as VRM & {
    body: Mesh
    jacket: Mesh
    duplicateA: Mesh
    duplicateB: Mesh
    collider: Mesh
    interactionCollider: Mesh
    hair: Mesh
    accessories: Mesh
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
      'U_Hair_3.001',
      'U_Accessories_2.001',
    ])
    expect(getVrmMeshNodes(vrm)[0].materialNames).toEqual(['Skin'])
    expect(getVrmMeshNodes(vrm)[0].vertexCount).toBe(3)
  })

  it('classifies body, outfit, and accessory meshes by name or material', () => {
    const vrm = createVrm()
    const categories = Object.fromEntries(
      getVrmMeshNodes(vrm).map(node => [node.id, node.category]),
    )

    expect(categories).toMatchObject({
      'BaseMesh_BODY.001': 'body',
      'QuantumHacker_Suit.001': 'outfit',
      'Extra': 'outfit',
      'U_Hair_3.001': 'body',
      'U_Accessories_2.001': 'accessories',
    })
    expect(getVrmMeshCategory('mesh_0', ['Skin'])).toBe('body')
    expect(getVrmMeshCategory('mesh_1', ['Suit'])).toBe('outfit')
    expect(getVrmMeshCategory('QuantumHacker_Suit_jacket')).toBe('outfit')
    expect(getVrmMeshCategory('U_Accessories_2.001')).toBe('accessories')
  })

  it('keeps name keywords after three.js strips dots from exported node names', () => {
    expect(getVrmMeshCategory('BaseMesh_EYEBROWS001', ['U_BaseMesh_Secondary002'])).toBe('body')
    expect(getVrmMeshCategory('BaseMesh_BODY001', ['U_Skin002'])).toBe('body')
    expect(getVrmMeshCategory('U_Eyes_1001', ['U_EyeColor_1001'])).toBe('body')
    expect(getVrmMeshCategory('QuantumHacker_Suit001', ['QuantumHacker_Suit001'])).toBe('outfit')
    expect(getVrmMeshCategory('QuantumHacker_Suitjacket', ['QuantumHacker_Suit001'])).toBe('outfit')
  })

  it('applies manual category overrides without changing visibility', () => {
    const nodes = getVrmMeshNodes(createVrm())
    const overridden = applyVrmMeshCategoryOverrides(nodes, {
      'Extra': 'extras',
      'U_Accessories_2.001': 'body',
    })

    expect(overridden.find(node => node.id === 'Extra')?.category).toBe('extras')
    expect(overridden.find(node => node.id === 'U_Accessories_2.001')?.category).toBe('body')
    expect(overridden.find(node => node.id === 'BaseMesh_BODY.001')?.category).toBe('body')
    expect(overridden.every(node => node.visible)).toBe(true)
  })

  it('ignores invisible interaction raycaster colliders', () => {
    const vrm = createVrm()

    expect(getVrmMeshNodes(vrm).map(node => node.id)).not.toContain('vrm_interaction_head')
    expect(setVrmMeshNodeVisibility(vrm, 'vrm_interaction_head', false)).toBe(false)

    vrm.interactionCollider.visible = false
    resetVrmMeshNodeVisibility(vrm)
    expect(vrm.interactionCollider.visible).toBe(false)
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
