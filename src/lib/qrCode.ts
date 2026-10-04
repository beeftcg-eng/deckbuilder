import qrcode from 'qrcode-generator'

/**
 * A QR code for `text` as one SVG path in a size×size grid of modules (quiet zone not included), so it
 * can be drawn crisp at any size. Error correction M: still reads off a phone screen with some glare.
 */
export function qrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  let path = ''
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`
  }
  return { size, path }
}
