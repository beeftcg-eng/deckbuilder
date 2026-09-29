/**
 * The scanner's "got it" sound: two quick rising notes, made with Web Audio so there's no sound file
 * to download. Phones only let a page make sound after a tap, so unlock() is called on the first
 * touch in the scanner.
 */
let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (context) return context
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  context = new Ctor()
  return context
}

/** Call from a tap: lets later chimes play. */
export function unlockChime(): void {
  const ctx = audio()
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
}

export function playChime(): void {
  const ctx = audio()
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime + 0.01
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = start + i * 0.09
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.16)
  }
}
