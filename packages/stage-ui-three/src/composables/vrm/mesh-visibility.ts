import type { VRM } from '@pixiv/three-vrm'
import type { Material } from 'three'

import { Mesh } from 'three'

import { isVrmInteractionColliderName } from './interaction'

/** Groups mesh nodes into the radial menu categories. */
export const VRM_MESH_CATEGORIES = ['body', 'outfit', 'accessories', 'extras'] as const

/** Identifies a mesh category in the model-parts menu. */
export type VrmMeshCategory = (typeof VRM_MESH_CATEGORIES)[number]

/** One mesh node that can be shown or hidden on a loaded VRM. */
export interface VrmMeshNode {
  /** Stable node name; duplicate names get an ordinal suffix. */
  id: string
  name: string
  category: VrmMeshCategory
  visible: boolean
  materialNames: string[]
  vertexCount: number
  skinned: boolean
}

interface VrmMeshEntry {
  id: string
  mesh: Mesh
}

const SPRING_BONE_COLLIDER_PREFIX = 'VRMC_springBone_collider'

function meshMaterialNames(material: Material | Material[] | undefined) {
  if (!material)
    return []
  return (Array.isArray(material) ? material : [material])
    .map(entry => entry.name?.trim() || entry.type || 'material')
}

const BODY_TOKENS = new Set([
  'body',
  'head',
  'face',
  'eye',
  'eyes',
  'eyebrow',
  'eyebrows',
  'brow',
  'brows',
  'lash',
  'lashes',
  'teeth',
  'tooth',
  'tongue',
  'mouth',
  'lip',
  'lips',
  'nose',
  'ear',
  'ears',
  'hair',
  'skin',
  'neck',
  'chest',
  'breast',
  'waist',
  'hip',
  'hips',
  'arm',
  'arms',
  'leg',
  'legs',
  'hand',
  'hands',
  'foot',
  'feet',
  'finger',
  'fingers',
  'nail',
  'nails',
  'scalp',
  'jaw',
  'cheek',
])

const OUTFIT_TOKENS = new Set([
  'suit',
  'jacket',
  'shirt',
  'coat',
  'dress',
  'skirt',
  'pants',
  'trousers',
  'shorts',
  'boot',
  'boots',
  'shoe',
  'shoes',
  'sock',
  'socks',
  'glove',
  'gloves',
  'armor',
  'armour',
  'cloth',
  'clothes',
  'clothing',
  'uniform',
  'outfit',
  'swimsuit',
  'bikini',
  'hoodie',
  'sweater',
  'vest',
  'tie',
  'necktie',
  'scarf',
  'cape',
  'cloak',
  'robe',
  'jeans',
  'leggings',
  'stockings',
  'tights',
  'kimono',
  'yukata',
  'apron',
  'jersey',
])

const ACCESSORY_TOKENS = new Set([
  'accessory',
  'accessories',
  'glasses',
  'goggles',
  'earring',
  'earrings',
  'necklace',
  'pendant',
  'bracelet',
  'ring',
  'watch',
  'belt',
  'bag',
  'hat',
  'cap',
  'helmet',
  'mask',
  'horn',
  'horns',
  'wing',
  'wings',
  'tail',
  'weapon',
  'sword',
  'shield',
  'prop',
  'earmuff',
  'earmuffs',
  'headphone',
  'headphones',
  'hairpin',
  'hairclip',
  'ribbon',
  'bow',
])

function tokenize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([a-z])(\d)/gi, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function hasAnyToken(tokens: Set<string>, candidates: Set<string>) {
  for (const token of candidates) {
    if (tokens.has(token))
      return true
  }
  return false
}

function categoryFromText(value: string): VrmMeshCategory | undefined {
  const tokens = new Set(tokenize(value))
  if (hasAnyToken(tokens, ACCESSORY_TOKENS))
    return 'accessories'
  if (hasAnyToken(tokens, BODY_TOKENS))
    return 'body'
  if (hasAnyToken(tokens, OUTFIT_TOKENS))
    return 'outfit'
}

/**
 * Groups a mesh into a menu category by its node name, then its material names.
 * Unknown meshes stay in Outfit so they remain reachable.
 */
export function getVrmMeshCategory(name: string, materialNames: readonly string[] = []): VrmMeshCategory {
  return categoryFromText(name) ?? categoryFromText(materialNames.join(' ')) ?? 'outfit'
}

function isToggleableMesh(object: unknown): object is Mesh {
  if (!(object instanceof Mesh) || !object.geometry)
    return false
  if (object.name.startsWith(SPRING_BONE_COLLIDER_PREFIX))
    return false
  return !isVrmInteractionColliderName(object.name)
}

/**
 * Collects the renderable mesh nodes in traversal order.
 *
 * Names are unique in most exported VRMs, but Blender exports can repeat them.
 * The ordinal suffix keeps the key stable for the same model while avoiding
 * collisions between duplicate node names.
 */
export function getVrmMeshEntries(vrm: Pick<VRM, 'scene'> | undefined): VrmMeshEntry[] {
  if (!vrm)
    return []

  const entries: VrmMeshEntry[] = []
  const nameCounts = new Map<string, number>()
  vrm.scene.traverse((object) => {
    if (!isToggleableMesh(object))
      return

    const name = object.name.trim() || `mesh-${entries.length}`
    const ordinal = nameCounts.get(name) ?? 0
    nameCounts.set(name, ordinal + 1)
    entries.push({
      id: ordinal === 0 ? name : `${name}#${ordinal}`,
      mesh: object,
    })
  })
  return entries
}

/** Lists the model parts that can be toggled without changing the scene graph. */
export function getVrmMeshNodes(vrm: Pick<VRM, 'scene'> | undefined): VrmMeshNode[] {
  return getVrmMeshEntries(vrm).map(({ id, mesh }) => {
    const materialNames = meshMaterialNames(mesh.material)
    return {
      id,
      name: mesh.name || id,
      category: getVrmMeshCategory(mesh.name, materialNames),
      visible: mesh.visible,
      materialNames,
      vertexCount: mesh.geometry?.getAttribute('position')?.count ?? 0,
      skinned: (mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh === true,
    }
  })
}

/** Applies one visibility value and reports whether the mesh existed. */
export function setVrmMeshNodeVisibility(
  vrm: Pick<VRM, 'scene'> | undefined,
  id: string,
  visible: boolean,
): boolean {
  const entry = getVrmMeshEntries(vrm).find(candidate => candidate.id === id)
  if (!entry)
    return false
  entry.mesh.visible = visible
  return true
}

/** Applies a saved visibility map after a model load or reload. */
export function applyVrmMeshNodeVisibility(
  vrm: Pick<VRM, 'scene'> | undefined,
  visibility: Record<string, boolean> | undefined,
): void {
  if (!visibility)
    return
  for (const { id, mesh } of getVrmMeshEntries(vrm)) {
    const visible = visibility[id]
    if (visible !== undefined)
      mesh.visible = visible
  }
}

/** Makes every collected mesh visible again. */
export function resetVrmMeshNodeVisibility(vrm: Pick<VRM, 'scene'> | undefined): void {
  for (const { mesh } of getVrmMeshEntries(vrm))
    mesh.visible = true
}
