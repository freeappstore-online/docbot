// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearHistory, loadHistory, saveHistory, type StoredMessage } from './persist'

const KEY = 'docbot.history'

function msg(role: 'user' | 'assistant', content: string, id = crypto.randomUUID()): StoredMessage {
  return { id, role, content }
}

describe('persist.loadHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns [] when storage is empty', () => {
    expect(loadHistory()).toEqual([])
  })

  it('returns [] when storage has invalid JSON', () => {
    localStorage.setItem(KEY, 'not json {')
    expect(loadHistory()).toEqual([])
  })

  it('returns [] when stored value is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ messages: [] }))
    expect(loadHistory()).toEqual([])
    localStorage.setItem(KEY, JSON.stringify(null))
    expect(loadHistory()).toEqual([])
    localStorage.setItem(KEY, JSON.stringify('a string'))
    expect(loadHistory()).toEqual([])
  })

  it('filters out malformed messages', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: '1', role: 'user', content: 'ok' },
        { role: 'user', content: 'no id' },
        { id: '3', role: 'system', content: 'bad role' },
        { id: '4', role: 'assistant' },
        null,
        'string',
        { id: '5', role: 'assistant', content: 'also ok' },
      ]),
    )
    const loaded = loadHistory()
    expect(loaded).toHaveLength(2)
    expect(loaded[0].content).toBe('ok')
    expect(loaded[1].content).toBe('also ok')
  })

  it('trims to the most recent 50 messages on load', () => {
    const many = Array.from({ length: 60 }, (_, i) => msg('user', `m${i}`, String(i)))
    localStorage.setItem(KEY, JSON.stringify(many))
    const loaded = loadHistory()
    expect(loaded).toHaveLength(50)
    expect(loaded[0].content).toBe('m10')
    expect(loaded[49].content).toBe('m59')
  })
})

describe('persist.saveHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('writes valid messages to storage', () => {
    const messages = [msg('user', 'hi'), msg('assistant', 'hello there')]
    saveHistory(messages)
    const raw = localStorage.getItem(KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed).toHaveLength(2)
  })

  it('drops empty/in-flight messages with no content and no error', () => {
    const messages: StoredMessage[] = [
      msg('user', 'real question'),
      { id: 'placeholder', role: 'assistant', content: '' },
    ]
    saveHistory(messages)
    const parsed = JSON.parse(localStorage.getItem(KEY)!)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].content).toBe('real question')
  })

  it('keeps messages with an error but no content', () => {
    const messages: StoredMessage[] = [
      { id: 'a', role: 'assistant', content: '', error: 'boom' },
    ]
    saveHistory(messages)
    const parsed = JSON.parse(localStorage.getItem(KEY)!)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].error).toBe('boom')
  })

  it('trims to MAX (50) on save', () => {
    const many = Array.from({ length: 70 }, (_, i) => msg('user', `m${i}`))
    saveHistory(many)
    const parsed = JSON.parse(localStorage.getItem(KEY)!)
    expect(parsed).toHaveLength(50)
    expect(parsed[0].content).toBe('m20')
  })

  it('clears storage when no messages survive filtering', () => {
    localStorage.setItem(KEY, JSON.stringify([msg('user', 'old')]))
    saveHistory([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('persist.clearHistory', () => {
  it('removes the stored history', () => {
    localStorage.setItem(KEY, JSON.stringify([msg('user', 'x')]))
    clearHistory()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('is a no-op when nothing is stored', () => {
    expect(() => clearHistory()).not.toThrow()
  })
})
