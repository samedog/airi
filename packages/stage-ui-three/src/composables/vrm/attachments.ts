import type { VRM } from '@pixiv/three-vrm'
import type { VrmResolvedAttachment } from '@proj-airi/stage-shared/vrm-attachments'
import type { Object3D } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'

import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

import { useVRMLoader } from './loader'
import { getVrmMeshEntries, setVrmMeshNodeVisibility } from './mesh-visibility'

const DEG_TO_RAD = Math.PI / 180

export function createVrmAttachmentRuntime() {
  const sources = new Map<string, Object3D>()
  const active = new Map<string, Object3D>()
  const maskedMeshes = new Map<string, boolean>()
  let generation = 0

  async function loadSource(url: string) {
    const cached = sources.get(url)
    if (cached)
      return cached

    const gltf = await useVRMLoader().loadAsync(url)
    const vrm = gltf.userData.vrm as VRM | undefined
    if (vrm) {
      if (vrm.meta?.metaVersion === '0')
        VRMUtils.rotateVRM0(vrm)
      sources.set(url, vrm.scene)
      return vrm.scene
    }

    sources.set(url, gltf.scene)
    return gltf.scene
  }

  function restoreMasks(vrm?: VRM) {
    if (!vrm)
      return
    for (const [id, visible] of maskedMeshes)
      setVrmMeshNodeVisibility(vrm, id, visible)
    maskedMeshes.clear()
  }

  function applyMasks(vrm: VRM, attachments: readonly VrmResolvedAttachment[]) {
    const hidden = new Set<string>()
    for (const attachment of attachments) {
      if (!attachment.visible)
        continue
      for (const id of attachment.hideMeshIds)
        hidden.add(id)
    }
    for (const id of hidden) {
      const entry = getVrmMeshEntries(vrm).find(candidate => candidate.id === id)
      if (!entry)
        continue
      if (!maskedMeshes.has(id))
        maskedMeshes.set(id, entry.mesh.visible)
      entry.mesh.visible = false
    }
  }

  function removeActive() {
    for (const object of active.values())
      object.removeFromParent()
    active.clear()
  }

  async function apply(vrm: VRM | undefined, attachments: readonly VrmResolvedAttachment[]) {
    const request = ++generation
    removeActive()
    restoreMasks(vrm)
    if (!vrm)
      return

    const visible = attachments.filter(attachment => attachment.visible)
    for (const attachment of visible) {
      let source: Object3D
      try {
        source = await loadSource(attachment.url)
      }
      catch (error) {
        console.error(`[VRM] Failed to load attachment ${attachment.name}`, error)
        continue
      }
      if (request !== generation)
        return

      const bone = vrm.humanoid?.getRawBoneNode(attachment.bone)
      if (!bone) {
        console.warn(`[VRM] Attachment ${attachment.name} has no bone ${attachment.bone}`)
        continue
      }

      const object = SkeletonUtils.clone(source)
      object.name = `attachment:${attachment.id}`
      object.position.fromArray(attachment.transform.position)
      object.rotation.set(
        attachment.transform.rotation[0] * DEG_TO_RAD,
        attachment.transform.rotation[1] * DEG_TO_RAD,
        attachment.transform.rotation[2] * DEG_TO_RAD,
      )
      object.scale.setScalar(attachment.transform.scale)
      object.visible = true
      bone.add(object)
      active.set(attachment.id, object)
    }

    if (request === generation)
      applyMasks(vrm, visible)
  }

  function dispose() {
    generation += 1
    removeActive()
    maskedMeshes.clear()
    for (const source of sources.values()) {
      source.removeFromParent()
      source.traverse((object) => {
        const mesh = object as Object3D & { geometry?: { dispose: () => void }, material?: { dispose: () => void } }
        mesh.geometry?.dispose()
        mesh.material?.dispose()
      })
    }
    sources.clear()
  }

  return { apply, dispose }
}
