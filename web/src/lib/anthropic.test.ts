import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  askDocbot,
  clearStoredKey,
  getStoredKey,
  parseSseStream,
  setStoredKey,
} from './anthropic'

const STORAGE_KEY = 'docbot.anthropic_key'

describe('anthropic key storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips a key', () => {
    expect(getStoredKey()).toBeNull()
    setStoredKey('sk-ant-test-1234')
    expect(getStoredKey()).toBe('sk-ant-test-1234')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sk-ant-test-1234')
  })

  it('clears the stored key', () => {
    setStoredKey('sk-ant-test-1234')
    clearStoredKey()
    expect(getStoredKey()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns null and does not throw when localStorage is unavailable', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage disabled')
      },
    })
    try {
      expect(getStoredKey()).toBeNull()
      expect(() => setStoredKey('x')).not.toThrow()
      expect(() => clearStoredKey()).not.toThrow()
    } finally {
      if (orig) Object.defineProperty(globalThis, 'localStorage', orig)
    }
  })
})

// Build a ReadableStream that emits the given chunks in order, encoded as
// UTF-8. Mirrors how fetch() exposes res.body in the browser.
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(enc.encode(chunks[i++]))
    },
  })
}

describe('parseSseStream', () => {
  it('emits text deltas in order', async () => {
    const tokens: string[] = []
    const body = streamFrom([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}\n\n',
      'data: [DONE]\n\n',
    ])
    await parseSseStream(body, (t) => tokens.push(t))
    expect(tokens).toEqual(['Hello ', 'world'])
  })

  it('ignores non-delta events', async () => {
    const tokens: string[] = []
    const body = streamFrom([
      'event: message_start\n',
      'data: {"type":"message_start"}\n\n',
      'data: {"type":"ping"}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n',
    ])
    await parseSseStream(body, (t) => tokens.push(t))
    expect(tokens).toEqual(['x'])
  })

  it('handles chunks split mid-event', async () => {
    const tokens: string[] = []
    const body = streamFrom([
      'data: {"type":"content_block',
      '_delta","delta":{"type":"text_delta","text":"split"}}\n\n',
    ])
    await parseSseStream(body, (t) => tokens.push(t))
    expect(tokens).toEqual(['split'])
  })

  it('flushes the final unterminated data: line', async () => {
    const tokens: string[] = []
    // No trailing \n\n — this is the bug the SSE parser previously had.
    const body = streamFrom([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"last"}}',
    ])
    await parseSseStream(body, (t) => tokens.push(t))
    expect(tokens).toEqual(['last'])
  })

  it('skips malformed JSON payloads', async () => {
    const tokens: string[] = []
    const body = streamFrom([
      'data: {not json\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n',
    ])
    await parseSseStream(body, (t) => tokens.push(t))
    expect(tokens).toEqual(['ok'])
  })

  it('does nothing on an empty stream', async () => {
    const tokens: string[] = []
    await parseSseStream(streamFrom([]), (t) => tokens.push(t))
    expect(tokens).toEqual([])
  })
})

describe('askDocbot', () => {
  let originalFetch: typeof fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('throws on non-OK status', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('upstream rate-limited', { status: 429 }),
    ) as unknown as typeof fetch

    await expect(
      askDocbot({
        question: 'q',
        context: [],
        history: [],
        apiKey: 'sk-ant-x',
        onToken: () => {},
      }),
    ).rejects.toThrow(/429/)
  })

  it('streams tokens from the response body', async () => {
    const body = streamFrom([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}\n\n',
      'data: [DONE]\n\n',
    ])
    globalThis.fetch = vi.fn(async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    ) as unknown as typeof fetch

    const tokens: string[] = []
    await askDocbot({
      question: 'q',
      context: [],
      history: [],
      apiKey: 'sk-ant-x',
      onToken: (t) => tokens.push(t),
    })
    expect(tokens.join('')).toBe('hi there')
  })

  it('passes the api key and version headers', async () => {
    const seen: { headers?: HeadersInit } = {}
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.headers = init?.headers
      return new Response(streamFrom(['data: [DONE]\n\n']), { status: 200 })
    }) as unknown as typeof fetch

    await askDocbot({
      question: 'q',
      context: [],
      history: [],
      apiKey: 'sk-ant-secret',
      onToken: () => {},
    })

    const h = seen.headers as Record<string, string>
    expect(h['x-api-key']).toBe('sk-ant-secret')
    expect(h['anthropic-version']).toBe('2023-06-01')
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('throws when the response has no body', async () => {
    globalThis.fetch = vi.fn(async () => {
      // A 200 with body=null is unusual but possible (HEAD-shaped responses
      // shouldn't happen here, but guard anyway).
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch

    await expect(
      askDocbot({
        question: 'q',
        context: [],
        history: [],
        apiKey: 'sk-ant-x',
        onToken: () => {},
      }),
    ).rejects.toThrow(/No response body/)
  })
})
