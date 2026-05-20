// Chat history persistence in localStorage. Cap at MAX_MESSAGES so a
// long-running session can't fill the quota. Empty/in-flight messages are
// dropped on save so we don't restore mid-stream placeholders after a refresh.

import type { ChatTurn } from './anthropic'
import type { Chunk } from './kb'

export interface StoredMessage extends ChatTurn {
  id: string
  sources?: Chunk[]
  error?: string
}

const HISTORY_KEY = 'docbot.history'
const MAX_MESSAGES = 50

export function loadHistory(): StoredMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidMessage).slice(-MAX_MESSAGES)
  } catch {
    return []
  }
}

export function saveHistory(messages: StoredMessage[]): void {
  try {
    const trimmed = messages
      .filter((m) => m.content || m.error)
      .slice(-MAX_MESSAGES)
    if (trimmed.length === 0) {
      localStorage.removeItem(HISTORY_KEY)
    } else {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
    }
  } catch {
    // Quota exceeded or storage unavailable. Drop silently — losing history
    // is better than crashing the chat.
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    // ignore
  }
}

function isValidMessage(m: unknown): m is StoredMessage {
  if (!m || typeof m !== 'object') return false
  const msg = m as Record<string, unknown>
  return (
    typeof msg.id === 'string' &&
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string'
  )
}
