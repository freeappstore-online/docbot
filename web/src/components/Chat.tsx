import { useEffect, useRef, useState } from 'react'
import { askDocbot, clearStoredKey, getStoredKey, type ChatTurn } from '../lib/anthropic'
import { retrieve } from '../lib/kb'
import { renderMarkdown, sanitizeUrl } from '../lib/markdown'
import { clearHistory, loadHistory, saveHistory, type StoredMessage } from '../lib/persist'
import { CopyButton } from './CopyButton'
import { KeyPanel } from './KeyPanel'

type Message = StoredMessage

const STARTERS = [
  'What is FreeAppStore?',
  'How do I publish my first app?',
  'Is there a paid tier?',
  'What does fas check look for?',
]

export function Chat({ onResetKey }: { onResetKey: () => void }) {
  const [messages, setMessages] = useState<Message[]>(() => loadHistory())
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [showingKeyPanel, setShowingKeyPanel] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Ref-based guard against two rapid send() calls landing before React commits
  // the busy=true state (e.g., double-tapping a starter button). State alone
  // isn't enough — the check would see the stale value.
  const inFlightRef = useRef(false)

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    saveHistory(messages)
  }, [messages])

  async function send(text: string) {
    const apiKey = getStoredKey()
    if (!apiKey) {
      onResetKey()
      return
    }
    const trimmed = text.trim()
    if (!trimmed || inFlightRef.current) return
    inFlightRef.current = true

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    const placeholder: Message = { id: crypto.randomUUID(), role: 'assistant', content: '' }
    const priorTurns: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, userMsg, placeholder])
    setDraft('')
    setBusy(true)

    try {
      const sources = await retrieve(trimmed, 5)
      setMessages((prev) =>
        prev.map((m) => (m.id === placeholder.id ? { ...m, sources } : m)),
      )

      await askDocbot({
        question: trimmed,
        context: sources,
        history: priorTurns,
        apiKey,
        onToken: (tok) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === placeholder.id ? { ...m, content: m.content + tok } : m)),
          )
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id ? { ...m, error: message, content: m.content || '' } : m,
        ),
      )
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }

  function resetSession() {
    setMessages([])
    clearHistory()
  }

  function resetKey() {
    clearStoredKey()
    onResetKey()
  }

  return (
    <div className="flex flex-1 flex-col gap-3 py-2 lg:py-0">
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <h1 className="display-font text-2xl font-bold text-[var(--ink)]">docbot</h1>
          <p className="text-xs text-[var(--muted)]">
            Trained on the FreeAppStore docs. Ask anything.
          </p>
        </div>
        <div className="flex gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetSession}
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            >
              clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowingKeyPanel((v) => !v)}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            key
          </button>
        </div>
      </div>

      {showingKeyPanel && (
        <KeyPanel
          onClose={() => setShowingKeyPanel(false)}
          onReplace={() => {
            setShowingKeyPanel(false)
            resetKey()
          }}
        />
      )}

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-quiet)] p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-sm text-sm text-[var(--muted)]">
              Try one of these, or type your own question below.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-1.5 text-xs text-[var(--ink)] hover:border-[var(--accent)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m) => (
              <li key={m.id} className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-2 text-sm text-white'
                      : 'max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)]'
                  }
                >
                  {m.content ? (
                    m.role === 'assistant' ? (
                      <div className="leading-relaxed">{renderMarkdown(m.content)}</div>
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    )
                  ) : m.role === 'assistant' && !m.error ? (
                    <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)]" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:120ms]" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:240ms]" />
                    </span>
                  ) : null}

                  {m.error && (
                    <div className="mt-2 rounded-md bg-[var(--paper-deep)] px-2 py-1 text-xs text-[var(--error)]">
                      {m.error}
                    </div>
                  )}

                  {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                    <details className="mt-3 text-xs text-[var(--muted)]">
                      <summary className="cursor-pointer hover:text-[var(--ink)]">
                        {m.sources.length} source{m.sources.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="mt-2 flex flex-col gap-1">
                        {m.sources.map((s) => (
                          <li key={s.id}>
                            <a
                              href={sanitizeUrl(s.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-[var(--ink)]"
                            >
                              {s.title} — {s.heading}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                {m.content && <CopyButton text={m.content} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="flex items-center gap-2 rounded-2xl border border-[var(--line-strong)] bg-[var(--paper)] p-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={busy ? 'Thinking…' : 'Ask about FreeAppStore…'}
          disabled={busy}
          className="flex-1 bg-transparent px-2 py-2 text-sm text-[var(--ink)] outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}

