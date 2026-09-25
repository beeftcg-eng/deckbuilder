import { Fragment } from 'react'

/** Renders a translated string, turning `**text**` into bold (see shared/i18n/en.ts). */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  )
}
