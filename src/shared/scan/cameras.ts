/**
 * Which camera the desktop scanner opens when you haven't picked one. The system's first camera is
 * often not a webcam at all: OBS's virtual camera (which shows nothing unless OBS is streaming to
 * it) or an HDMI capture card. A camera named like a webcam comes first, then any real one.
 */
const VIRTUAL = /virtual|\bobs\b|loopback|snap camera|manycam|xsplit|splitcam|droidcam|epoccam/i
const WEBCAM = /webcam|web cam|camera|\bcam\b|facetime|integrated|c9[0-9]{2}|brio|kiyo/i

export interface CameraInfo {
  id: string
  label: string
}

export function defaultCamera(cameras: readonly CameraInfo[]): string | undefined {
  const score = (c: CameraInfo) => (VIRTUAL.test(c.label) ? 2 : WEBCAM.test(c.label) ? 0 : 1)
  return [...cameras].sort((a, b) => score(a) - score(b))[0]?.id
}
