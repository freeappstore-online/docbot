import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMarkdown, sanitizeUrl } from './markdown'

// All the renderer needs to produce is a tree of React elements. We render to
// static markup to assert the resulting HTML — that's the user-visible
// contract.
function html(src: string): string {
  return renderToStaticMarkup(<>{renderMarkdown(src)}</>)
}

describe('sanitizeUrl', () => {
  it('allows http and https', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com')
  })

  it('allows mailto and tel', () => {
    expect(sanitizeUrl('mailto:hi@example.com')).toBe('mailto:hi@example.com')
    expect(sanitizeUrl('tel:+15555550100')).toBe('tel:+15555550100')
  })

  it('allows relative + anchor + protocol-relative URLs', () => {
    expect(sanitizeUrl('/foo')).toBe('/foo')
    expect(sanitizeUrl('#section')).toBe('#section')
    expect(sanitizeUrl('./relative')).toBe('./relative')
    expect(sanitizeUrl('../sibling')).toBe('../sibling')
    expect(sanitizeUrl('//cdn.example.com/x')).toBe('//cdn.example.com/x')
    expect(sanitizeUrl('?q=1')).toBe('?q=1')
  })

  it('treats no-scheme strings as relative', () => {
    expect(sanitizeUrl('plain-text')).toBe('plain-text')
  })

  it('blocks javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#')
    expect(sanitizeUrl('JavaScript:alert(1)')).toBe('#')
    expect(sanitizeUrl('  javascript:alert(1)  ')).toBe('#')
  })

  it('blocks javascript: with embedded control chars', () => {
    expect(sanitizeUrl('java\tscript:alert(1)')).toBe('#')
    expect(sanitizeUrl('java\nscript:alert(1)')).toBe('#')
    expect(sanitizeUrl('\x00javascript:alert(1)')).toBe('#')
  })

  it('blocks data: URLs', () => {
    expect(sanitizeUrl('data:text/html,<script>')).toBe('#')
  })

  it('blocks vbscript: URLs', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('#')
  })

  it('blocks file: URLs', () => {
    expect(sanitizeUrl('file:///etc/passwd')).toBe('#')
  })

  it('returns # for empty input', () => {
    expect(sanitizeUrl('')).toBe('#')
    expect(sanitizeUrl('   ')).toBe('#')
  })
})

describe('renderMarkdown', () => {
  it('renders empty input as nothing', () => {
    expect(html('')).toBe('')
    expect(html('   ')).toBe('')
  })

  it('renders a plain paragraph', () => {
    const out = html('Hello world')
    expect(out).toContain('<p')
    expect(out).toContain('Hello world')
  })

  it('renders **bold**', () => {
    const out = html('This is **bold** text')
    expect(out).toContain('<strong>bold</strong>')
  })

  it('renders __bold__ alt syntax', () => {
    const out = html('Try __this__')
    expect(out).toContain('<strong>this</strong>')
  })

  it('renders *italic*', () => {
    const out = html('This is *italic* text')
    expect(out).toContain('<em>italic</em>')
  })

  it('renders _italic_ alt syntax', () => {
    const out = html('Mark _here_ please')
    expect(out).toContain('<em>here</em>')
  })

  it('renders `code`', () => {
    const out = html('Run `fas check` for that')
    expect(out).toContain('<code')
    expect(out).toContain('fas check')
  })

  it('does not bold inside backticks', () => {
    const out = html('Code: `**not bold**`')
    expect(out).not.toContain('<strong>')
    expect(out).toContain('**not bold**')
  })

  it('renders safe markdown links', () => {
    const out = html('See [docs](https://example.com/x)')
    expect(out).toContain('href="https://example.com/x"')
    expect(out).toContain('docs</a>')
  })

  it('blocks javascript: links by rewriting to #', () => {
    const out = html('Click [me](javascript:alert(1))')
    expect(out).toContain('href="#"')
    expect(out).not.toContain('alert(1)')
  })

  it('blocks data: links', () => {
    const out = html('Click [me](data:text/html,<script>)')
    expect(out).toContain('href="#"')
  })

  it('renders an unordered list', () => {
    const out = html('- one\n- two\n- three')
    expect(out).toContain('<ul')
    expect(out).toMatch(/<li>one<\/li>/)
    expect(out).toMatch(/<li>two<\/li>/)
  })

  it('renders an ordered list', () => {
    const out = html('1. first\n2. second')
    expect(out).toContain('<ol')
    expect(out).toMatch(/<li>first<\/li>/)
  })

  it('keeps adjacent blocks separate', () => {
    const out = html('para one\n\npara two')
    const pCount = (out.match(/<p/g) || []).length
    expect(pCount).toBe(2)
  })

  it('handles only-text input', () => {
    expect(html('just words')).toContain('just words')
  })

  it('does not crash on malformed markdown', () => {
    expect(() => html('[unclosed bracket')).not.toThrow()
    expect(() => html('**unclosed bold')).not.toThrow()
    expect(() => html('[label](')).not.toThrow()
  })
})
