/**
 * A system notification, when the app is allowed to show them (the desktop app always is; the phone
 * app asks the first time you set a price alert). Phones only show them through the service worker.
 * Never throws: a notification is a nice extra, the in-app notice is the real message.
 */
export async function notify(title: string, body: string): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined)
    if (registration) {
      await registration.showNotification(title, { body, icon: 'icons/icon-192.png' })
      return
    }
    new Notification(title, { body })
  } catch {
    // Not supported here.
  }
}

/** Asks for permission to notify, if it hasn't been asked yet. Call it from a tap or click. */
export function askToNotify(): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
  } catch {
    // Not supported here.
  }
}
