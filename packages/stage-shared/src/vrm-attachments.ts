/** Supported attachment file formats. */
export const VRM_ATTACHMENT_FORMATS = ['glb', 'vrm'] as const

/** Identifies a supported attachment file format. */
export type VrmAttachmentFormat = (typeof VRM_ATTACHMENT_FORMATS)[number]

/** VRM humanoid bones that can receive an attachment. */
export const VRM_ATTACHMENT_BONES = [
  'head',
  'neck',
  'chest',
  'spine',
  'hips',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
] as const

/** Identifies a VRM humanoid bone that can receive an attachment. */
export type VrmAttachmentBone = (typeof VRM_ATTACHMENT_BONES)[number]

/** One imported attachment file in the shared library. */
export interface VrmAttachmentAsset {
  id: string
  name: string
  format: VrmAttachmentFormat
  fileName: string
  byteSize: number
  importedAt: number
}

/** Position, rotation, and scale in the local space of the socket bone. */
export interface VrmAttachmentTransform {
  position: [number, number, number]
  /** Euler rotation in degrees. */
  rotation: [number, number, number]
  scale: number
}

/** One asset attached to one model at one humanoid bone. */
export interface VrmAttachmentBinding {
  id: string
  assetId: string
  bone: VrmAttachmentBone
  transform: VrmAttachmentTransform
  visible: boolean
  /** Mesh nodes that this attachment covers. They stay hidden while it is visible. */
  hideMeshIds: string[]
}

/** A binding resolved with its asset metadata and object URL. */
export interface VrmResolvedAttachment extends VrmAttachmentBinding {
  name: string
  format: VrmAttachmentFormat
  url: string
}

export const DEFAULT_VRM_ATTACHMENT_TRANSFORM: VrmAttachmentTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
}

/** Returns the attachment format from a file name, or null for another format. */
export function vrmAttachmentFormatFromFileName(fileName: string): VrmAttachmentFormat | null {
  const extension = fileName.split('.').pop()?.toLowerCase()
  return VRM_ATTACHMENT_FORMATS.find(format => format === extension) ?? null
}
