import { JPEG_QUALITIES, MAX_IMAGE_BYTES, dataUrlBytes } from '../shared/exportImage'

/**
 * A JPEG `data:` URL of the canvas that is guaranteed to fit under `maxBytes`: it tries lower and lower qualities and,
 * if even the lowest is too big, shrinks the picture by a quarter and tries again. (Cards are photographic art, so JPEG
 * is several times smaller than PNG at no visible cost.)
 */
export function encodeUnderLimit(canvas: HTMLCanvasElement, maxBytes = MAX_IMAGE_BYTES): string {
  let source = canvas
  for (let shrinks = 0; shrinks < 6; shrinks++) {
    for (const quality of JPEG_QUALITIES) {
      const url = source.toDataURL('image/jpeg', quality)
      if (dataUrlBytes(url) <= maxBytes) return url
    }
    const smaller = document.createElement('canvas')
    smaller.width = Math.max(1, Math.round(source.width * 0.75))
    smaller.height = Math.max(1, Math.round(source.height * 0.75))
    const ctx = smaller.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, smaller.width, smaller.height)
    source = smaller
  }
  return source.toDataURL('image/jpeg', JPEG_QUALITIES[JPEG_QUALITIES.length - 1])
}
