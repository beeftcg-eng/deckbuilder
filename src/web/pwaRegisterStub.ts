// The desktop build has no service worker: vite.config.ts points 'virtual:pwa-register' here.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => undefined
}
