import { useState } from 'react'

// Tiny "copy to clipboard" button. Shows "copied" feedback for ~1.4s.
// Silently no-ops if the Clipboard API is unavailable (insecure context,
// older browser) — we don't surface that as an error to the user.
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard API unavailable. No-op.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--ink)]"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}
