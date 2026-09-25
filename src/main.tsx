import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyCachedTheme } from './lib/theme'
import { applyCachedLanguage } from './lib/language'
import { getLanguage } from './shared/i18n'
import { useAppStore } from './state/useAppStore'
import { installWebApiIfNeeded } from './web/webApi'

// No-op inside Electron (its preload script already set window.api via contextBridge before this
// module ever runs) - only takes effect when this bundle is loaded as a plain web page (the PWA).
installWebApiIfNeeded()

applyCachedTheme()
applyCachedLanguage()
// The store was created (on import) before the language above was picked.
useAppStore.setState({ language: getLanguage() })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
