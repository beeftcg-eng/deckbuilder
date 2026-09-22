import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyCachedTheme } from './lib/theme'
import { installWebApiIfNeeded } from './web/webApi'

// No-op inside Electron (its preload script already set window.api via contextBridge before this
// module ever runs) - only takes effect when this bundle is loaded as a plain web page (the PWA).
installWebApiIfNeeded()

applyCachedTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
