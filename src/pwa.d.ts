// vite-plugin-pwa's virtual module (phone app build only; the desktop build aliases it to
// src/web/pwaRegisterStub.ts). Just the part used by src/web/pwaUpdate.ts.
declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: unknown) => void
  }): (reloadPage?: boolean) => Promise<void>
}
