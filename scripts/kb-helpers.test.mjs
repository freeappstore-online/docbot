import { describe, expect, it } from 'vitest'
import {
  canonicalPath,
  chunkText,
  decodeEntities,
  extractLinks,
  extractSections,
  extractTitle,
  stripTags,
} from './kb-helpers.mjs'

const ORIGIN = 'https://freeappstore.pages.dev'

describe('canonicalPath', () => {
  it('keeps root as /', () => {
    expect(canonicalPath('/')).toBe('/')
  })

  it('strips trailing slash', () => {
    expect(canonicalPath('/foo/')).toBe('/foo')
    expect(canonicalPath('/foo/bar/')).toBe('/foo/bar')
  })

  it('drops .html', () => {
    expect(canonicalPath('/foo.html')).toBe('/foo')
    expect(canonicalPath('/index.html')).toBe('/index')
  })

  it('strips query and hash', () => {
    expect(canonicalPath('/foo?a=1')).toBe('/foo')
    expect(canonicalPath('/foo#x')).toBe('/foo')
    expect(canonicalPath('/foo?a=1#bar')).toBe('/foo')
  })
})

describe('stripTags', () => {
  it('removes simple tags', () => {
    expect(stripTags('<b>hi</b>')).toBe('hi')
    expect(stripTags('<p class="x">hello <em>world</em></p>')).toBe('hello world')
  })
})

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(decodeEntities('a &lt; b &gt; c')).toBe('a < b > c')
    expect(decodeEntities('&quot;hi&quot;')).toBe('"hi"')
    expect(decodeEntities('it&#39;s')).toBe("it's")
    expect(decodeEntities('a&nbsp;b')).toBe('a b')
  })

  it('decodes numeric entities', () => {
    expect(decodeEntities('A&#65;')).toBe('AA')
  })

  it('passes plain text through', () => {
    expect(decodeEntities('plain text')).toBe('plain text')
  })
})

describe('extractTitle', () => {
  it('returns the page title text', () => {
    expect(extractTitle('<html><title>Hi there</title></html>')).toBe('Hi there')
  })

  it('decodes entities in titles', () => {
    expect(extractTitle('<title>Tom &amp; Jerry</title>')).toBe('Tom & Jerry')
  })

  it('returns null when no title is present', () => {
    expect(extractTitle('<html><body>x</body></html>')).toBeNull()
  })
})

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const out = chunkText('hello world', 180)
    expect(out).toEqual(['hello world'])
  })

  it('returns [] for whitespace input', () => {
    expect(chunkText('   \n\t', 180)).toEqual([])
    expect(chunkText('', 180)).toEqual([])
  })

  it('splits long text into ~target-sized chunks', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(' ')
    const out = chunkText(words, 100)
    expect(out.length).toBeGreaterThan(1)
    // Each chunk should be close to the target (~100 words).
    for (const c of out) {
      const n = c.split(' ').length
      expect(n).toBeLessThanOrEqual(100)
    }
  })

  it('collapses internal whitespace', () => {
    expect(chunkText('a    b\n\nc\t\td', 180)).toEqual(['a b c d'])
  })
})

describe('extractLinks', () => {
  it('extracts absolute same-origin links', () => {
    const html = `<a href="${ORIGIN}/foo">x</a>`
    expect(extractLinks(html, '/', ORIGIN)).toEqual(['/foo'])
  })

  it('drops cross-origin links', () => {
    const html = `<a href="https://other.example/foo">x</a>`
    expect(extractLinks(html, '/', ORIGIN)).toEqual([])
  })

  it('extracts root-relative links', () => {
    const html = `<a href="/docs">x</a><a href='/about'>y</a>`
    expect(extractLinks(html, '/', ORIGIN)).toEqual(['/docs', '/about'])
  })

  it('resolves relative links against fromPath', () => {
    const html = `<a href="other">x</a>`
    expect(extractLinks(html, '/docs/intro', ORIGIN)).toEqual(['/docs/other'])
  })

  it('decodes HTML-escaped attribute values', () => {
    const html = `<a href="/search?a=1&amp;b=2">x</a>`
    expect(extractLinks(html, '/', ORIGIN)).toEqual(['/search?a=1&b=2'])
  })

  it('skips dangerous schemes', () => {
    const html = `
      <a href="javascript:alert(1)">x</a>
      <a href="data:text/html,evil">y</a>
      <a href="mailto:hi@example.com">z</a>
      <a href="tel:+15555550100">t</a>
    `
    expect(extractLinks(html, '/', ORIGIN)).toEqual([])
  })

  it('skips asset URLs', () => {
    const html = `
      <a href="/x.png">a</a>
      <a href="/y.pdf">b</a>
      <a href="/style.css">c</a>
      <a href="/script.js">d</a>
      <a href="/real">ok</a>
    `
    expect(extractLinks(html, '/', ORIGIN)).toEqual(['/real'])
  })

  it('handles protocol-relative same-origin URLs', () => {
    const host = ORIGIN.replace(/^https?:/, '')
    const html = `<a href="${host}/foo">x</a>`
    expect(extractLinks(html, '/', ORIGIN)).toEqual(['/foo'])
  })

  it('skips malformed URLs without crashing', () => {
    const html = `<a href="https://[bad]/foo">x</a><a href="/ok">y</a>`
    const out = extractLinks(html, '/', ORIGIN)
    expect(out).toContain('/ok')
  })
})

describe('extractSections', () => {
  it('splits at h2 headings', () => {
    const html = `
      <main>
        <h1>Top</h1>
        <p>intro text</p>
        <h2>Setup</h2>
        <p>setup text</p>
        <h2>Usage</h2>
        <p>usage text</p>
      </main>
    `
    const sections = extractSections(html)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    const headings = sections.map((s) => s.heading)
    expect(headings).toContain('Setup')
    expect(headings).toContain('Usage')
  })

  it('strips script, style, nav, header, footer', () => {
    const html = `
      <main>
        <script>evil()</script>
        <style>.x{}</style>
        <nav>nav things</nav>
        <header>header things</header>
        <footer>footer things</footer>
        <h2>Body</h2>
        <p>real content</p>
      </main>
    `
    const sections = extractSections(html)
    const all = sections.map((s) => s.body).join(' ')
    expect(all).toContain('real content')
    expect(all).not.toContain('evil()')
    expect(all).not.toContain('.x{}')
    expect(all).not.toContain('nav things')
    expect(all).not.toContain('header things')
    expect(all).not.toContain('footer things')
  })

  it('decodes entities in section bodies', () => {
    const html = `<main><h2>X</h2><p>Tom &amp; Jerry</p></main>`
    const sections = extractSections(html)
    const target = sections.find((s) => s.heading === 'X')
    expect(target?.body).toContain('Tom & Jerry')
  })

  it('falls back to Introduction heading for unheaded content', () => {
    const html = `<main><p>just a paragraph</p></main>`
    const sections = extractSections(html)
    expect(sections[0].heading).toBe('Introduction')
    expect(sections[0].body).toContain('just a paragraph')
  })
})
