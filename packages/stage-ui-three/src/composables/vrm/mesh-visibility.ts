import type { VRM } from '@pixiv/three-vrm'
import type { Material } from 'three'

import { Mesh } from 'three'

import { isVrmInteractionColliderName } from './interaction'

/** One mesh node that can be shown or hidden on a loaded VRM. */
export interface VrmMeshNode {
  /** Stable node name; duplicate names get an ordinal suffix. */
  id: string
  name: string
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
  return getVrmMeshEntries(vrm).map(({ id, mesh }) => ({
    id,
    name: mesh.name || id,
    visible: mesh.visible,
    materialNames: meshMaterialNames(mesh.material),
    vertexCount: mesh.geometry?.getAttribute('position')?.count ?? 0,
    skinned: (mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh === true,
  }))
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
