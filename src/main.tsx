import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyCachedTheme } from './lib/theme'
import { applyCachedLanguage } from './lib/language'
import { getLanguage } from './shared/i18n'
import { useAppStore } from './state/useAppStore'
import { installWebApiIfNeeded } from './web/webApi'
import { installErrorLog } from './lib/errorLog'

installErrorLog()

// No-op inside Electron (its preload script already set window.api via contextBridge before this
// module ever runs) - only takes effect when this bundle is loaded as a plain web page (the PWA).
installWebApiIfNeeded()

// The phone app reloads itself onto a new version as soon as one is ready (pwaUpdate.ts).
if (__WEB__) void import('./web/pwaUpdate').then((m) => m.keepPwaUpdated())

applyCachedTheme()
applyCachedLanguage()
// The store was created (on import) before the language above was picked.
useAppStore.setState({ language: getLanguage() })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
