import { app, type BrowserWindow } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The launch smoke test (DECKBUILDER_SMOKE_TEST=1, run by CI and scripts/release.sh on the built
 * app): start on a fresh, empty data folder, wait for the app's screen, and exit 0 - or exit 1 if
 * the window crashes, the page throws, a panel shows "Something went wrong", or the screen doesn't
 * appear in time. Catches "the app won't open" before a release reaches anyone.
 */
export const SMOKE_TEST = process.env.DECKBUILDER_SMOKE_TEST === '1'

const TIMEOUT_MS = 45_000
/** After the screen appears, how long to keep watching (startup loads data and settings). */
const SETTLE_MS = 5_000

// Never the real data folder: set as this module loads, before anything reads the path.
if (SMOKE_TEST) app.setPath('userData', mkdtempSync(join(tmpdir(), 'brewhouse-smoke-')))

export function watchSmokeTest(win: BrowserWindow): void {
  if (!SMOKE_TEST) return
  const errors: string[] = []
  const finish = (ok: boolean, why: string) => {
    console.log(`Smoke test ${ok ? 'passed' : 'FAILED'}: ${why}`)
    app.exit(ok ? 0 : 1)
  }
  const timer = setTimeout(() => finish(false, `no app screen within ${TIMEOUT_MS / 1000} s${errors.length ? `; errors: ${errors.join(' | ')}` : ''}`), TIMEOUT_MS)
  win.webContents.on('render-process-gone', (_e, details) => finish(false, `the window's process died (${details.reason})`))
  win.webContents.on('preload-error', (_e, _path, err) => finish(false, `the preload script failed: ${err.message}`))
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' && /Uncaught|is not a function|is not defined|Cannot read/i.test(event.message)) errors.push(event.message.slice(0, 300))
  })
  win.webContents.on('did-finish-load', () => {
    const check = async () => {
      const state = (await win.webContents.executeJavaScript(
        `({ shell: !!document.querySelector('.app-shell'), crashed: [...document.querySelectorAll('.crash-notice')].map((e) => e.textContent).join(' | ') })`,
      )) as { shell: boolean; crashed: string }
      if (state.crashed) return finish(false, `a panel crashed: ${state.crashed.slice(0, 300)}`)
      if (!state.shell) return void setTimeout(() => void check(), 500)
      setTimeout(async () => {
        clearTimeout(timer)
        const after = (await win.webContents.executeJavaScript(`[...document.querySelectorAll('.crash-notice')].map((e) => e.textContent).join(' | ')`)) as string
        if (after) finish(false, `a panel crashed: ${after.slice(0, 300)}`)
        else if (errors.length) finish(false, `the page threw: ${errors.join(' | ')}`)
        else finish(true, 'the app opened and showed its screen')
      }, SETTLE_MS)
    }
    void check()
  })
}
