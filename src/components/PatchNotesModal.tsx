import { useEffect, useState } from 'react'
import type { PatchNote } from '../shared/patchNotes'

interface Props {
  onClose: () => void
}

type Block = { kind: 'heading'; text: string } | { kind: 'list'; items: string[] } | { kind: 'p'; text: string }

/** Release notes are written as plain markdown (## headings, - bullets, blank-line paragraphs) - enough
 * structure to walk line by line without pulling in a markdown library for this one screen. */
function toBlocks(body: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: string[] = []

  function flushParagraph() {
    if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') })
    paragraph = []
  }
  function flushList() {
    if (list.length) blocks.push({ kind: 'list', items: list })
    list = []
  }

  for (const rawLine of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'heading', text: line.slice(3) })
    } else if (line.startsWith('- ')) {
      flushParagraph()
      list.push(line.slice(2))
    } else if (line === '') {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  return blocks
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function PatchNotesModal({ onClose }: Props) {
  const [notes, setNotes] = useState<PatchNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.patchNotes
      .list()
      .then((list) => {
        if (!cancelled) setNotes(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal patch-notes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Patch notes</span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="patch-notes-body">
          {error && <div className="sync-error">Couldn't load patch notes: {error}</div>}
          {!error && !notes && <div className="text-dim">Loading…</div>}
          {notes?.map((note) => (
            <div key={note.version} className="patch-note">
              <div className="patch-note-header">
                <b>{note.name}</b>
                <span className="text-dim">{formatDate(note.publishedAt)}</span>
              </div>
              {toBlocks(note.body).map((block, i) =>
                block.kind === 'heading' ? (
                  <h4 key={i} className="patch-note-heading">
                    {block.text}
                  </h4>
                ) : block.kind === 'list' ? (
                  <ul key={i} className="patch-note-list">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{block.text}</p>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
