// Browser-direct call to api.anthropic.com using the user's own pasted key.
// The FAS secret-injecting proxy explicitly blocks anthropic.com hosts
// (proxy-allowlist.ts in platform/packages/backend) so server-side key
// injection is not available on the free tier.

import type { Chunk } from './kb'

const STORAGE_KEY = 'docbot.anthropic_key'
const MODEL = 'claude-haiku-4-5-20251001'

export function getStoredKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key)
}

export function clearStoredKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface AskParams {
  question: string
  context: Chunk[]
  history: ChatTurn[]
  apiKey: string
  signal?: AbortSignal
  onToken: (text: string) => void
}

const SYSTEM_PROMPT = `You are docbot, a support assistant for FreeAppStore (freeappstore.online).

Answer questions strictly from the CONTEXT block. If the context does not contain enough information to answer, say so plainly and suggest which page of the docs to visit (use the URLs in the context). Never invent features, commands, or pricing.

Style: short, concrete, no fluff. Plain prose with bullet lists where helpful. Cite source pages inline like "(see /guidelines)" using the path from the source URL.`

export async function askDocbot({ question, context, history, apiKey, signal, onToken }: AskParams) {
  const contextBlock = context
    .map((c, i) => `[${i + 1}] ${c.title} — ${c.heading}\nURL: ${c.url}\n\n${c.text}`)
    .join('\n\n---\n\n')

  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    {
      role: 'user' as const,
      content: `CONTEXT (retrieved from freeappstore.pages.dev):\n\n${contextBlock}\n\n---\n\nQUESTION: ${question}`,
    },
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      stream: true,
      messages,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${errText || res.statusText}`)
  }
  if (!res.body) throw new Error('No response body to stream.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload) as {
          type: string
          delta?: { type?: string; text?: string }
        }
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          onToken(evt.delta.text)
        }
      } catch {
        // Skip malformed lines.
      }
    }
  }
}
