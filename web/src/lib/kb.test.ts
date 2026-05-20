import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const FIXTURE = {
  generatedAt: '2026-05-20T00:00:00.000Z',
  source: 'https://freeappstore.pages.dev',
  pages: 2,
  chunks: [
    {
      id: '/publish#introduction-0',
      url: 'https://freeappstore.pages.dev/publish',
      title: 'Publish your app',
      heading: 'Introduction',
      text: 'Publish a free PWA on FreeAppStore. Run fas publish from the project root.',
    },
    {
      id: '/guidelines#size-0',
      url: 'https://freeappstore.pages.dev/guidelines',
      title: 'Submission guidelines',
      heading: 'Bundle size',
      text: 'Bundle must be under 300KB gzipped. Check with fas check.',
    },
    {
      id: '/pricing#intro-0',
      url: 'https://freeappstore.pages.dev/pricing',
      title: 'Pricing',
      heading: 'Free forever',
      text: 'FreeAppStore is 100% free for all users and developers. No tier system.',
    },
  ],
}

describe('kb.retrieve', () => {
  beforeEach(() => {
    vi.resetModules()
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/kb.json')) {
        return new Response(JSON.stringify(FIXTURE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns hits with the full Chunk shape', async () => {
    const { retrieve } = await import('./kb')
    const hits = await retrieve('publish app')
    expect(hits.length).toBeGreaterThan(0)
    const top = hits[0]
    expect(top).toHaveProperty('id')
    expect(top).toHaveProperty('url')
    expect(top).toHaveProperty('title')
    expect(top).toHaveProperty('heading')
    expect(top).toHaveProperty('text')
    expect(top.url).toMatch(/freeappstore\.pages\.dev/)
  })

  it('ranks the most relevant chunk first', async () => {
    const { retrieve } = await import('./kb')
    const hits = await retrieve('bundle size')
    expect(hits[0].id).toBe('/guidelines#size-0')
  })

  it('caps the number of returned hits at k', async () => {
    const { retrieve } = await import('./kb')
    const hits = await retrieve('the', 1)
    expect(hits.length).toBeLessThanOrEqual(1)
  })

  it('returns [] when the query matches nothing', async () => {
    const { retrieve } = await import('./kb')
    const hits = await retrieve('zzzzqqquuuxxx-nomatch-token')
    expect(hits).toEqual([])
  })

  it('handles whitespace-only queries gracefully', async () => {
    const { retrieve } = await import('./kb')
    const hits = await retrieve('   ')
    expect(Array.isArray(hits)).toBe(true)
  })
})
