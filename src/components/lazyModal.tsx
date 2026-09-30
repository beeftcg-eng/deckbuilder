import { lazy, Suspense, type ComponentProps, type ComponentType } from 'react'

/**
 * A window (modal) whose code loads the first time it opens, so the phone app's first load doesn't
 * carry every dialog. Use it like the component itself; it shows nothing while loading, which on a
 * phone is a blink.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyModal<M extends Record<K, ComponentType<any>>, K extends keyof M & string>(load: () => Promise<M>, name: K): M[K] {
  const Lazy = lazy(async () => ({ default: (await load())[name] }))
  function LazyModal(props: ComponentProps<M[K]>) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  return LazyModal as unknown as M[K]
}
