import { ipcMain } from 'electron'
import { fetchJson, USER_AGENT } from '../../src/shared/games/fetchUtil'
import type { PatchNote } from '../../src/shared/patchNotes'

// The public repo electron-updater already points at (package.json's build.publish) - releases
// there are this app's actual changelog, so there's nothing separate to keep in sync by hand.
const RELEASES_REPO = 'beeftcg-eng/deckbuilder-releases'
const RELEASES_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=15`

interface GithubRelease {
  tag_name: string
  name: string | null
  body: string | null
  published_at: string
  html_url: string
  draft: boolean
  prerelease: boolean
}

// Refetched once per app launch, not on every open - the list changes at most once per release.
let cached: PatchNote[] | null = null

export function registerPatchNotesIpc(): void {
  ipcMain.handle('patchNotes:list', async (): Promise<PatchNote[]> => {
    if (cached) return cached
    const releases = await fetchJson<GithubRelease[]>(RELEASES_URL, 1, { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' })
    cached = releases
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => ({
        version: r.tag_name.replace(/^v/, ''),
        name: r.name ?? r.tag_name,
        body: r.body ?? '',
        publishedAt: r.published_at,
        url: r.html_url,
      }))
    return cached
  })
}
