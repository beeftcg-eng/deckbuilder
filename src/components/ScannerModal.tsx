import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore, useVisibleGames } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rarityColorClass } from '../shared/rarityColor'
import { matchesSearch, matchRank } from '../shared/cardSearch'
import type { Card, GameId } from '../shared/types'
import type { PaddleModel } from '../lib/scan/paddle'
import {
  cropFrame,
  guideInVideo,
  guideRect,
  isConfident,
  loadScannerModel,
  scannerModelSaved,
  printingKey,
  rankByPicture,
  rankByText,
  checkFrame,
  FrameGate,
  readCard,
  scanIndexFor,
  type RankedCandidate,
  type Rect,
} from '../lib/scan/scanner'
import { printedNumber, variantName } from '../shared/scan/scanIndex'
import { playChime, unlockChime } from '../lib/scan/chime'
import { t } from '../shared/i18n'
import { formatPrice } from '../shared/collection'

type Phase = 'looking' | 'reading' | 'checking' | 'steady'
type Target = 'collection' | 'wishlist' | 'opening'

interface Result {
  ranked: RankedCandidate[]
  confident: boolean
  selected: Card
  /** Every printing of the recognised name, for "All printings". */
  allPrintings: Card[]
  /** The printed name as the scanner read it, so the card isn't offered again while it's still in view. */
  seenName: string | null
  /** The picture comparison is still ranking the printings. */
  refining: boolean
  /** The person tapped a printing themselves: the picture comparison mustn't change it. */
  picked: boolean
  /** Which reading this sheet shows, so a late picture result only updates its own sheet. */
  token: number
}

interface Added {
  key: number
  card: Card
  quantity: number
  target: Target
  /** The pack opening it went into, for undo. */
  openingId?: string
}

const AUTO_ADD_KEY = 'brewhouse.scanner.autoAdd'
const SOUND_KEY = 'brewhouse.scanner.sound'
const CAMERA_KEY = 'brewhouse.scanner.camera'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Resolves once the browser has drawn the latest state (so a status change is visible before heavy work). */
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0'
  } catch {
    return true
  }
}

/** The camera picked last time, when the device has more than one (a laptop's webcam and a USB one). */
function readCamera(): string {
  try {
    return localStorage.getItem(CAMERA_KEY) ?? ''
  } catch {
    return ''
  }
}

function readAutoAdd(): boolean {
  try {
    return localStorage.getItem(AUTO_ADD_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The phone app's card scanner: a live camera view with a card-shaped guide. It reads whatever card
 * is held in the guide (name, set code, collector number - see lib/scan/scanner.ts), pauses on a
 * match and offers to add it to the collection or wishlist, with every other printing one tap away.
 */
export default function ScannerModal({ onClose }: { onClose: () => void }) {
  const gameId = useAppStore((s) => s.currentGameId)
  const setGame = useAppStore((s) => s.setGame)
  const visibleGames = useVisibleGames()
  const catalog = useAppStore((s) => s.catalogs[gameId])
  const cachedCount = useAppStore((s) => s.syncMeta[gameId]?.count ?? 0)
  const syncProgress = useAppStore((s) => s.syncProgress[gameId])
  const collection = useAppStore((s) => s.collection)
  const wishlist = useAppStore((s) => s.wishlist)
  const adapter = getAdapter(gameId)

  const [model, setModel] = useState<PaddleModel | null>(null)
  const [loadPercent, setLoadPercent] = useState(0)
  // Whether the models are already on this device (then there's nothing to download); null until known.
  const [modelSaved, setModelSaved] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false })
  const [phase, setPhase] = useState<Phase>('looking')
  const [glare, setGlare] = useState(false)
  /** The last read's time and engine, shown small in the footer: what to report when scanning feels slow. */
  const [lastRead, setLastRead] = useState<{ ms: number; backend: string } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [quantity, setQuantity] = useState(1)
  // A pack opening being filled in (Collection → Pack openings) is where scans go, until switched.
  const activeOpening = useAppStore((s) => s.settings.packOpenings?.find((o) => o.id === s.activeOpeningId && o.gameId === s.currentGameId) ?? null)
  const [target, setTarget] = useState<Target>(() => (activeOpening ? 'opening' : 'collection'))
  const openingRef = useRef(activeOpening?.id ?? null)
  openingRef.current = activeOpening?.id ?? null
  if (target === 'opening' && !activeOpening) setTarget('collection')
  const [autoAdd, setAutoAdd] = useState(readAutoAdd)
  const [sound, setSound] = useState(readSound)
  const soundRef = useRef(sound)
  soundRef.current = sound
  const [session, setSession] = useState<Added[]>([])
  const sessionRef = useRef(session)
  sessionRef.current = session
  // What this session put in the collection becomes one batch, per game, that Collection can undo later.
  useEffect(
    () => () => {
      const byGame = new Map<GameId, { cardId: string; quantity: number }[]>()
      for (const e of sessionRef.current) {
        if (e.target !== 'collection') continue
        byGame.set(e.card.gameId, [...(byGame.get(e.card.gameId) ?? []), { cardId: e.card.id, quantity: e.quantity }])
      }
      for (const [game, items] of byGame) useAppStore.getState().recordCollectionBatch(game, 'scan', items)
    },
    [],
  )
  const [showSession, setShowSession] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [cameraId, setCameraId] = useState(readCamera)
  /** Bumped on every pick, so picking the camera already chosen still restarts it. */
  const [cameraPick, setCameraPick] = useState(0)
  const [cameras, setCameras] = useState<{ id: string; label: string; active: boolean }[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pausedRef = useRef(false)
  const autoAddRef = useRef(autoAdd)
  const targetRef = useRef(target)
  const addRef = useRef<(card: Card, qty: number) => void>(() => {})
  const resultToken = useRef(0)
  /** Tells the reading loop a card was just added or skipped (by printed name), so it isn't offered again while in view. */
  const addedNameRef = useRef<(name: string) => void>(() => {})
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const syncing = syncProgress != null && !syncProgress.done

  autoAddRef.current = autoAdd
  targetRef.current = target
  pausedRef.current = result != null || search != null

  // Models: downloaded once, then from the browser's cache.
  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    void scannerModelSaved().then((saved) => !cancelled && setModelSaved(saved))
    loadScannerModel((f) => !cancelled && setLoadPercent(Math.round(f * 100)))
      .then((m) => !cancelled && setModel(m))
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Camera: the back one (or the one picked), as sharp as the phone gives.
  useEffect(() => {
    let cancelled = false
    setCameraError(null)
    const listCameras = async () =>
      (await navigator.mediaDevices.enumerateDevices().catch(() => []))
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `${t.scanner.camera} ${i + 1}` }))
    let listed: { id: string; label: string }[] = []
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no camera'), { name: 'NotFoundError' })
      listed = await listCameras()
      // The camera picked earlier, if it's still there; else the back one.
      const deviceId = listed.some((c) => c.id === cameraId) ? cameraId : ''
      // About 1080p in whichever orientation the phone gives, and never cropped to a shape: asking for a
      // landscape 1920x1080 made Chrome cut a square out of a portrait camera, losing most of the card.
      // The device is `exact`: as a mere preference, Chrome picked whichever camera had the closest resolution.
      const constraints: MediaTrackConstraints & { resizeMode?: string } = {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 1920 },
        height: { ideal: 1920 },
        resizeMode: 'none',
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false })
      if (cancelled) {
        stream.getTracks().forEach((tr) => tr.stop())
        return
      }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      // Names are only given once a camera is allowed, so the list is read again now.
      listed = await listCameras()
      const activeId = track?.getSettings().deviceId ?? deviceId
      if (!cancelled) setCameras(listed.map((c) => ({ ...c, active: c.id === activeId })))
      try {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
      } catch {
        // Not every camera takes focus hints.
      }
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
      setTorch({ supported: Boolean(caps.torch), on: false })
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => undefined)
        // A virtual camera with nothing feeding it, or a capture card with no signal, "starts" but never sends a picture.
        const gotPicture = await new Promise<boolean>((resolve) => {
          if (video.videoWidth > 0) return resolve(true)
          const timer = setTimeout(() => resolve(video.videoWidth > 0), 6000)
          video.addEventListener('loadeddata', () => (clearTimeout(timer), resolve(true)), { once: true })
        })
        if (cancelled) return
        if (!gotPicture) throw Object.assign(new Error('no picture'), { name: 'NoPictureError' })
        setCameraReady(true)
      }
    }
    start().catch((err: unknown) => {
      if (cancelled) return
      // The picker still shows, so another camera can be tried.
      setCameras(listed.map((c) => ({ ...c, active: c.id === cameraId })))
      const name = (err as { name?: string })?.name
      setCameraError(
        name === 'NoPictureError'
          ? t.scanner.cameraNoPicture
          : name === 'NotAllowedError' || name === 'SecurityError'
            ? t.scanner.cameraDenied
            : name === 'NotReadableError' && listed.length > 1
              ? t.scanner.cameraBusyPickAnother
              : name === 'NotFoundError' || name === 'OverconstrainedError'
                ? t.scanner.cameraMissing
                : t.scanner.cameraFailed(err instanceof Error ? err.message : String(err)),
      )
    })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
      setCameraReady(false)
    }
  }, [attempt, cameraId, cameraPick])

  // The guide is drawn from the stage's size, and the same numbers map it into the video frame.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setStageSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Card data for the game being scanned.
  useEffect(() => {
    if (!catalog && cachedCount > 0) void useAppStore.getState().loadCatalog(gameId)
  }, [gameId, catalog, cachedCount])
  useEffect(() => {
    if (!syncProgress?.done || syncProgress.error) return
    const { loadMeta, loadCatalog } = useAppStore.getState()
    void loadMeta(gameId).then(() => loadCatalog(gameId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, syncProgress?.done])

  const index = useMemo(() => (catalog ? scanIndexFor(gameId, catalog.cards) : null), [gameId, catalog])

  // The reading loop: read, match, compare pictures, and pause on a result until it's added or skipped.
  useEffect(() => {
    if (!model || !index || !cameraReady) return
    let cancelled = false
    let previousName: string | null = null
    // After adding a card it's usually still in view: don't offer it again until something else (or nothing) is seen.
    let justAdded: string | null = null
    const onAdded = (name: string) => {
      justAdded = name
    }
    addedNameRef.current = onAdded
    let readsSinceResult = 0
    let cycleStart = performance.now()
    const gate = new FrameGate()
    let unreadable = 0 // reads in a row that saw plenty of text but no card: usually glare on a foil
    async function loop() {
      while (!cancelled) {
        const video = videoRef.current
        const stage = stageRef.current
        if (pausedRef.current || document.hidden || !video || !stage || video.readyState < 2 || !video.videoWidth) {
          await sleep(200)
          continue
        }
        const guide = guideInVideo(guideRect(stage.clientWidth, stage.clientHeight), { width: stage.clientWidth, height: stage.clientHeight }, video)
        // Only spend a read on a steady, sharp frame: a card still moving into place reads as nothing.
        if (!gate.worthReading(checkFrame(video, guide))) {
          setPhase((p) => (p === 'looking' ? p : 'steady'))
          await sleep(90)
          continue
        }
        const crop = cropFrame(video, guide)
        setPhase('reading')
        // Let "Reading…" reach the screen before the reading work keeps the phone busy.
        await nextPaint()
        readsSinceResult++
        const reading = await readCard(model!, index!, crop).catch(() => null)
        if (reading) setLastRead({ ms: reading.ms, backend: reading.timings.backend })
        if (import.meta.env.DEV && reading) console.debug('[scan] read', JSON.stringify(reading.timings), reading.match.status)
        if (cancelled) return
        const best = reading?.match.candidates[0]
        const name = reading?.match.name?.display ?? best?.card.name ?? null
        if (!reading || !best || reading.match.status === 'none' || !name) {
          previousName = null
          justAdded = null
          unreadable = reading && reading.lineCount >= 4 ? unreadable + 1 : 0
          setGlare(unreadable >= 2)
          setPhase('looking')
          await sleep(120)
          continue
        }
        if (justAdded) {
          if (name === justAdded) {
            setPhase('looking')
            await sleep(250)
            continue
          }
          justAdded = null
        }
        // One read is enough unless the match is genuinely unsure; then wait for a second read that agrees.
        if (reading.match.status === 'unsure' && previousName !== name) {
          previousName = name
          setPhase('steady')
          continue
        }
        previousName = null
        unreadable = 0
        setGlare(false)
        // Show the text's answer straight away; the picture comparison re-ranks the printings a moment later.
        const textRanked = rankByText(reading)
        if (!textRanked.length) continue
        const entryPrintings = reading.match.name?.printings ?? []
        const allPrintingsOf = (ranked: RankedCandidate[]) => {
          const seen = new Set(ranked.map((c) => printingKey(c.card)))
          return [...ranked.map((c) => c.card), ...entryPrintings.filter((c) => !seen.has(printingKey(c)) && (seen.add(printingKey(c)), true))]
        }
        const needsPicture = textRanked.length > 1
        const tv = performance.now()
        const token = ++resultToken.current
        if (!autoAddRef.current || !needsPicture) {
          signalFound()
          if (!needsPicture && autoAddRef.current && isConfident(textRanked, reading)) {
            addRef.current(textRanked[0].card, 1)
            justAdded = name
            continue
          }
          setQuantity(1)
          setShowAll(false)
          setResult({ ranked: textRanked, confident: !needsPicture && isConfident(textRanked, reading), selected: textRanked[0].card, allPrintings: allPrintingsOf(textRanked), seenName: name, refining: needsPicture, picked: false, token })
          if (!needsPicture) continue
        } else {
          setPhase('checking')
        }
        const ranked = await rankByPicture(reading, crop)
        if (import.meta.env.DEV) {
          const timing = { reads: readsSinceResult, lastRead: reading.timings, visualMs: Math.round(performance.now() - tv), sinceLastResult: Math.round(performance.now() - cycleStart), candidates: ranked.length }
          console.debug('[scan] result', JSON.stringify(timing))
        }
        readsSinceResult = 0
        cycleStart = performance.now()
        if (cancelled) return
        if (!ranked.length) continue
        const confident = isConfident(ranked, reading)
        if (autoAddRef.current) {
          signalFound()
          if (confident) {
            addRef.current(ranked[0].card, 1)
            justAdded = name
            continue
          }
          setQuantity(1)
          setShowAll(false)
          setResult({ ranked, confident, selected: ranked[0].card, allPrintings: allPrintingsOf(ranked), seenName: name, refining: false, picked: false, token })
          continue
        }
        // Only update the sheet still showing this card, and keep a printing the person already tapped.
        setResult((r) => (r && r.token === token ? { ...r, ranked, confident, refining: false, selected: r.picked ? r.selected : ranked[0].card, allPrintings: allPrintingsOf(ranked) } : r))
      }
    }
    void loop()
    return () => {
      cancelled = true
    }
  }, [model, index, cameraReady])

  /** A card was recognised: buzz, and chime unless the sound is switched off. */
  function signalFound() {
    navigator.vibrate?.(35)
    if (soundRef.current) playChime()
  }

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function flash(text: string) {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  async function add(card: Card, qty: number) {
    const store = useAppStore.getState()
    const where = targetRef.current
    if (where === 'opening' && openingRef.current) await store.changePackPull(openingRef.current, card.id, qty)
    else if (where === 'collection') await store.changeOwned(card.id, qty)
    else await store.addToWishlist(card, qty)
    setSession((list) => [{ key: Date.now() + Math.random(), card, quantity: qty, target: where, openingId: openingRef.current ?? undefined }, ...list])
    flash(t.scanner.added(`${qty > 1 ? `${qty}× ` : ''}${card.name}`))
  }
  addRef.current = (card, qty) => void add(card, qty)

  async function undo(entry: Added) {
    const store = useAppStore.getState()
    if (entry.target === 'opening') {
      if (entry.openingId) await store.changePackPull(entry.openingId, entry.card.id, -entry.quantity)
    } else if (entry.target === 'collection') await store.changeOwned(entry.card.id, -entry.quantity)
    else {
      const w = store.wishlist.find((e) => e.cardId === entry.card.id)
      if (w) {
        if (w.quantity > entry.quantity) await store.setWishlistQuantity(w.id, w.quantity - entry.quantity)
        else await store.removeFromWishlist(w.id)
      }
    }
    setSession((list) => list.filter((e) => e.key !== entry.key))
  }

  function confirmAdd() {
    if (!result) return
    const card = result.selected
    void add(card, quantity)
    if (result.seenName) addedNameRef.current(result.seenName)
    setResult(null)
  }

  function skip() {
    if (result?.seenName) addedNameRef.current(result.seenName) // don't offer the same card again while it's still in view
    setResult(null)
  }

  function pick(card: Card) {
    setResult((r) => (r ? { ...r, selected: card, picked: true, confident: r.confident && r.ranked[0]?.card.id === card.id } : r))
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const on = !torch.on
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      setTorch({ supported: true, on })
    } catch {
      setTorch({ supported: false, on: false })
    }
  }

  function toggleSound() {
    const on = !sound
    setSound(on)
    if (on) {
      unlockChime()
      playChime()
    }
    try {
      localStorage.setItem(SOUND_KEY, on ? '1' : '0')
    } catch {
      // Private mode: the switch just isn't remembered.
    }
  }

  function chooseCamera(id: string) {
    setCameraId(id)
    setCameraPick((n) => n + 1)
    try {
      localStorage.setItem(CAMERA_KEY, id)
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  function toggleAutoAdd(on: boolean) {
    setAutoAdd(on)
    try {
      localStorage.setItem(AUTO_ADD_KEY, on ? '1' : '0')
    } catch {
      // Private mode: the switch just isn't remembered.
    }
  }

  const searchResults = useMemo(() => {
    const q = search?.trim().toLowerCase()
    if (!q || !catalog) return []
    return catalog.cards
      .filter((c) => matchesSearch(c, q))
      .sort((a, b) => matchRank(a, q) - matchRank(b, q) || a.name.localeCompare(b.name))
      .slice(0, 40)
  }, [search, catalog])

  const guide: Rect = guideRect(stageSize.width, stageSize.height)
  const sessionCount = session.reduce((n, e) => n + e.quantity, 0)
  const sessionWorth = session.reduce((sum, e) => sum + (e.card.price ?? 0) * e.quantity, 0)
  const ready = model && index && cameraReady
  const selected = result?.selected
  const alternatives = result ? (showAll ? result.allPrintings : result.ranked.map((c) => c.card)).slice(0, showAll ? 200 : 12) : []

  let status: string
  if (loadError) status = t.scanner.loadFailed(loadError)
  else if (cameraError) status = cameraError
  else if (!model) status = modelSaved ? t.scanner.starting : t.scanner.loading(loadPercent)
  else if (!index) status = cachedCount > 0 ? t.browser.loading(adapter.shortName) : t.scanner.needCards(adapter.shortName)
  else if (!cameraReady) status = t.scanner.looking
  else status = phase === 'reading' ? t.scanner.reading : phase === 'checking' ? t.scanner.checking : phase === 'steady' ? t.scanner.holdSteady : t.scanner.looking

  return createPortal(
    <div className="scanner-layer" role="dialog" aria-label={t.scanner.title} onPointerDown={unlockChime}>
      <header className="scanner-bar">
        <button className="btn" onClick={onClose}>
          {t.common.close}
        </button>
        <select aria-label={t.scanner.game} value={gameId} onChange={(e) => setGame(e.target.value as GameId)}>
          {visibleGames.map((g) => (
            <option key={g.id} value={g.id}>
              {g.shortName}
            </option>
          ))}
        </select>
        <div className="scanner-target" role="group" aria-label={t.scanner.addTo}>
          {(activeOpening ? (['opening', 'collection', 'wishlist'] as const) : (['collection', 'wishlist'] as const)).map((tg) => (
            <button key={tg} className={`btn ${target === tg ? 'btn-primary' : ''}`} aria-pressed={target === tg} onClick={() => setTarget(tg)}>
              {tg === 'opening' ? `📦 ${activeOpening?.name ?? ''}` : tg === 'collection' ? t.scanner.toCollection : t.scanner.toWishlist}
            </button>
          ))}
        </div>
        <button className="btn" onClick={toggleSound} aria-pressed={sound} title={sound ? t.scanner.soundOn : t.scanner.soundOff} aria-label={sound ? t.scanner.soundOn : t.scanner.soundOff}>
          {sound ? '🔊' : '🔇'}
        </button>
        {cameras.length > 1 && (
          <select aria-label={t.scanner.camera} value={cameras.find((c) => c.active)?.id ?? cameraId} onChange={(e) => chooseCamera(e.target.value)}>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {torch.supported && (
          <button className={`btn ${torch.on ? 'btn-primary' : ''}`} onClick={toggleTorch} aria-pressed={torch.on}>
            🔦 {t.scanner.light}
          </button>
        )}
      </header>

      <div className="scanner-stage" ref={stageRef}>
        <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
        {stageSize.width > 0 && (
          <div
            className={`scanner-guide ${phase === 'reading' || phase === 'checking' ? 'busy' : ''} ${result ? 'found' : ''}`}
            style={{ left: guide.x, top: guide.y, width: guide.w, height: guide.h, '--guide-h': `${guide.h}px` } as CSSProperties}
          >
            {/* Moves on the compositor, so it keeps going even while reading keeps the phone busy. */}
            {(phase === 'reading' || phase === 'checking') && !result && <div className="scanner-scanline" />}
          </div>
        )}
        <div className={`scanner-status ${result || search != null ? 'hidden' : ''}`}>
          <span>{status}</span>
          {!model && !loadError && modelSaved === false && <span className="scanner-note">{t.scanner.loadingNote}</span>}
          {(loadError || cameraError) && (
            <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
              {t.scanner.retry}
            </button>
          )}
          {model && !index && cachedCount === 0 && (
            <button className="btn btn-primary" disabled={syncing} onClick={() => useAppStore.getState().syncCatalog(gameId)}>
              {syncing ? t.sidebar.syncing(syncProgress?.loaded ?? 0, syncProgress?.total ?? '?') : t.sidebar.syncCardData}
            </button>
          )}
          {ready && !result && <span className={`scanner-note ${glare ? 'scanner-glare' : ''}`}>{glare ? t.scanner.glareTip : t.scanner.hint}</span>}
        </div>
        {toast && <div className="scanner-toast">{toast}</div>}

        {!result && search == null && (
          <div className="scanner-footer">
            <label className="scanner-auto">
              <input type="checkbox" checked={autoAdd} onChange={(e) => toggleAutoAdd(e.target.checked)} />
              {t.scanner.autoAdd}
            </label>
            {session.length > 0 && (
              <button className="btn" onClick={() => setShowSession((v) => !v)} aria-expanded={showSession}>
                {t.scanner.session(sessionCount)}
                {sessionWorth > 0 ? ` · ${formatPrice(sessionWorth)}` : ''} {showSession ? '▾' : '▴'}
              </button>
            )}
            {showSession && (
              <ul className="scanner-session">
                {session.map((e) => (
                  <li key={e.key}>
                    <span>
                      {e.quantity}× {e.card.name} <span className="text-dim">{e.card.setCode} {printedNumber(e.card)}</span>
                      {e.card.price != null && <span className="text-dim"> · {formatPrice(e.card.price * e.quantity)}</span>}
                    </span>
                    <button className="btn" onClick={() => void add(e.card, 1)}>
                      {t.scanner.oneMore}
                    </button>
                    <button className="btn" onClick={() => void undo(e)}>
                      {t.scanner.undo}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button className="link-btn" onClick={() => setSearch('')}>
              {t.scanner.wrongCard}
            </button>
            {lastRead && <span className="scanner-diag">{t.scanner.diagnostics(lastRead.backend === 'webgpu', lastRead.ms / 1000)}</span>}
          </div>
        )}
      </div>

      {result && selected && (
        <div className="scanner-sheet">
          <div className="scanner-card">
            {selected.imageUrlSmall || selected.imageUrl ? (
              <img src={selected.imageUrlSmall ?? selected.imageUrl ?? ''} alt={selected.name} />
            ) : (
              <div className="scanner-card-placeholder">{selected.name}</div>
            )}
            <div className="scanner-card-info">
              <span className={`scanner-verdict ${result.refining ? 'busy' : result.confident && selected.id === result.ranked[0]?.card.id ? 'ok' : 'check'}`}>
                {result.refining ? t.scanner.checking : result.confident && selected.id === result.ranked[0]?.card.id ? t.scanner.match : t.scanner.bestGuess}
              </span>
              <strong>{selected.name}</strong>
              <span>{selected.setName}</span>
              <span className="text-dim">
                {selected.setCode} · {printedNumber(selected)}
                {selected.rarity && (
                  <>
                    {' · '}
                    <span className={rarityColorClass(selected.rarity)}>{selected.rarity}</span>
                  </>
                )}
              </span>
              {variantName(selected) && <span className="scanner-variant">{variantName(selected)}</span>}
              <span className="scanner-price">
                {selected.price != null ? t.scanner.price(formatPrice(selected.price), selected.foilPrice != null && selected.foilPrice > 0 ? formatPrice(selected.foilPrice) : null) : t.scanner.noPrice}
              </span>
              <span className="text-dim">
                {t.scanner.owned(collection[selected.id] ?? 0)}
                {wishlist.some((w) => w.cardId === selected.id) ? ` · ${t.scanner.onWishlist}` : ''}
              </span>
            </div>
          </div>

          <div className="scanner-actions">
            <div className="stepper">
              <button className="btn stepper-btn" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                −
              </button>
              <span className="stepper-value">{quantity}</span>
              <button className="btn stepper-btn" onClick={() => setQuantity((q) => Math.min(99, q + 1))}>
                +
              </button>
            </div>
            <button className="btn btn-primary scanner-add" onClick={confirmAdd}>
              {target === 'opening' ? t.scanner.addToOpening(quantity) : t.scanner.add(quantity, target === 'wishlist')}
            </button>
            <button className="btn" onClick={skip}>
              {t.scanner.skip}
            </button>
          </div>

          {result.allPrintings.length > 1 && (
            <>
              <div className="scanner-alts-label text-dim">{t.scanner.otherPrintings}</div>
              <div className="scanner-alts">
                {alternatives.map((card) => (
                  <button key={card.id} className={`scanner-alt ${card.id === selected.id ? 'active' : ''}`} onClick={() => pick(card)} aria-pressed={card.id === selected.id}>
                    {card.imageUrlSmall || card.imageUrl ? <img src={card.imageUrlSmall ?? card.imageUrl ?? ''} alt="" loading="lazy" /> : <span className="scanner-alt-blank">{t.scanner.noPicture}</span>}
                    <span className="scanner-alt-code">
                      {card.setCode} {printedNumber(card)}
                    </span>
                    {variantName(card) && <span className="scanner-alt-variant">{variantName(card)}</span>}
                    {card.rarity && <span className={`scanner-alt-rarity ${rarityColorClass(card.rarity)}`}>{card.rarity}</span>}
                    {card.price != null && <span className="scanner-alt-price">{formatPrice(card.price)}</span>}
                  </button>
                ))}
              </div>
              {!showAll && result.allPrintings.length > alternatives.length && (
                <button className="link-btn" onClick={() => setShowAll(true)}>
                  {t.scanner.allPrintings(result.allPrintings.length)}
                </button>
              )}
            </>
          )}
          <button
            className="link-btn"
            onClick={() => {
              setSearch(selected.name)
              setResult(null)
            }}
          >
            {t.scanner.wrongCard}
          </button>
        </div>
      )}

      {search != null && (
        <div className="scanner-sheet scanner-search">
          <input autoFocus placeholder={t.scanner.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="scanner-search-list">
            {search.trim() && searchResults.length === 0 && <div className="text-dim">{t.scanner.searchNone}</div>}
            {searchResults.map((card) => (
              <button
                key={card.id}
                className="scanner-search-row"
                onClick={() => {
                  const printings = catalog?.cards.filter((c) => c.name === card.name) ?? [card]
                  setSearch(null)
                  setQuantity(1)
                  setShowAll(true)
                  setResult({ ranked: [], confident: false, selected: card, allPrintings: [card, ...printings.filter((c) => c.id !== card.id)], seenName: null, refining: false, picked: true, token: ++resultToken.current })
                }}
              >
                {card.imageUrlSmall ? <img src={card.imageUrlSmall} alt="" loading="lazy" /> : <span className="scanner-alt-blank" />}
                <span>
                  <strong>{card.name}</strong>
                  <span className="text-dim">
                    {' '}
                    {card.setCode} {printedNumber(card)}
                    {card.rarity ? ` · ${card.rarity}` : ''}
                    {variantName(card) ? ` · ${variantName(card)}` : ''}
                    {card.price != null ? ` · ${formatPrice(card.price)}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => setSearch(null)}>
            {t.scanner.backToScan}
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
