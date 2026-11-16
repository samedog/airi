import { describe, expect, it } from 'vitest'

import {
  DEFAULT_VRM_ATTACHMENT_TRANSFORM,
  VRM_ATTACHMENT_BONES,
  vrmAttachmentFormatFromFileName,
} from './vrm-attachments'

describe('vrm attachments', () => {
  it('reads supported formats from file names', () => {
    expect(vrmAttachmentFormatFromFileName('cyber-eye.glb')).toBe('glb')
    expect(vrmAttachmentFormatFromFileName('LEFT-ARM.VRM')).toBe('vrm')
    expect(vrmAttachmentFormatFromFileName('notes.txt')).toBeNull()
    expect(vrmAttachmentFormatFromFileName('model')).toBeNull()
  })

  it('keeps a complete humanoid socket list and neutral transform', () => {
    expect(VRM_ATTACHMENT_BONES).toContain('head')
    expect(VRM_ATTACHMENT_BONES).toContain('leftHand')
    expect(VRM_ATTACHMENT_BONES).toContain('rightFoot')
    expect(DEFAULT_VRM_ATTACHMENT_TRANSFORM).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    })
  })
})
