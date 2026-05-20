import { useState } from 'react'
import { setStoredKey } from '../lib/anthropic'

interface Props {
  onSaved: () => void
}

export function KeyPrompt({ onSaved }: Props) {
  const [value, setValue] = useState('')
  const [showing, setShowing] = useState(false)

  function save(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed.startsWith('sk-ant-')) return
    setStoredKey(trimmed)
    onSaved()
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <form
        onSubmit={save}
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-6 shadow-[var(--shadow-card)]"
      >
        <h2 className="display-font text-xl font-bold text-[var(--ink)]">Connect your Anthropic key</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          docbot answers questions about FreeAppStore using Claude. The free tier of FreeAppStore can't
          hold an LLM key for you, so paste your own. It's stored in this browser only and sent only to
          <code className="mx-1 rounded bg-[var(--paper-deep)] px-1">api.anthropic.com</code>.
        </p>
        <label className="mt-4 block">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">API key</span>
          <div className="mt-1 flex gap-2">
            <input
              type={showing ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 font-mono text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => setShowing((s) => !s)}
              className="rounded-lg border border-[var(--line)] px-3 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            >
              {showing ? 'hide' : 'show'}
            </button>
          </div>
        </label>
        <button
          type="submit"
          disabled={!value.trim().startsWith('sk-ant-')}
          className="mt-4 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          Save & start asking
        </button>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Don't have one?{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Get one from Anthropic
          </a>
          .
        </p>
      </form>
    </div>
  )
}
