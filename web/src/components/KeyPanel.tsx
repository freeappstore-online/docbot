import { useState } from 'react'
import { getStoredKey } from '../lib/anthropic'

interface Props {
  onClose: () => void
  onReplace: () => void
}

// Inline panel that lets the user view, copy, or replace the stored Anthropic
// key. Rendered from Chat when the user clicks the "key" pill in the header.
// Lifted out of Chat.tsx so the chat component stays focused on conversation
// state.
export function KeyPanel({ onClose, onReplace }: Props) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const key = getStoredKey() ?? ''
  // Mask: keep "sk-ant-" prefix + last 4 chars, hide the middle.
  const masked = key.length > 12 ? `${key.slice(0, 7)}${'•'.repeat(8)}${key.slice(-4)}` : '•'.repeat(key.length)

  async function copy() {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard API unavailable.
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Anthropic key</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="flex-1 break-all rounded-lg bg-[var(--paper-deep)] px-3 py-2 font-mono text-xs text-[var(--ink)]">
          {revealed ? key : masked}
        </code>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
        >
          {revealed ? 'hide' : 'show'}
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
        >
          {copied ? 'copied' : 'copy'}
        </button>
        <button
          type="button"
          onClick={onReplace}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--accent-deep)] hover:text-[var(--ink)]"
        >
          replace
        </button>
      </div>
      <p className="mt-2 text-[0.7rem] text-[var(--muted)]">
        Stored only in this browser's localStorage. Sent only to api.anthropic.com.
      </p>
    </div>
  )
}
