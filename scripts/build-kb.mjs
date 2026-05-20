#!/usr/bin/env node
// Crawls freeappstore.pages.dev, strips HTML to text, chunks each page, and
// writes web/public/kb.json. Re-run whenever upstream docs change.
//
// Output shape: { generatedAt, source, chunks: [{ id, url, title, heading, text }] }

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = process.env.KB_ORIGIN || 'https://freeappstore.pages.dev'
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'web',
  'public',
  'kb.json',
)
const MAX_PAGES = Number(process.env.KB_MAX_PAGES || 80)
const CHUNK_WORDS = 180

const seen = new Set()
const queue = ['/']
const chunks = []
let pageCount = 0

while (queue.length && pageCount < MAX_PAGES) {
  const raw = queue.shift()
  // Canonicalize: strip trailing slash (except root), drop .html extension,
  // drop query/hash. Cloudflare Pages serves /foo and /foo.html identically;
  // crawling both doubles the KB.
  let path = raw.split('#')[0].split('?')[0]
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1)
  if (path.endsWith('.html')) path = path.slice(0, -5) || '/'
  if (seen.has(path)) continue
  seen.add(path)

  const url = ORIGIN + path
  let html
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'docbot-kb-builder/0.1' } })
    if (!res.ok) {
      console.warn(`skip ${url} (${res.status})`)
      continue
    }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html')) continue
    html = await res.text()
  } catch (err) {
    console.warn(`fetch failed ${url}: ${err.message}`)
    continue
  }

  pageCount++
  const title = extractTitle(html) || path
  const sections = extractSections(html)

  let totalChunks = 0
  for (const section of sections) {
    for (const text of chunkText(section.body, CHUNK_WORDS)) {
      chunks.push({
        id: `${path}#${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${totalChunks}`,
        url,
        title,
        heading: section.heading,
        text,
      })
      totalChunks++
    }
  }
  console.log(`crawled ${path} → ${totalChunks} chunks (${title})`)

  for (const link of extractLinks(html, path)) {
    if (!seen.has(link) && !queue.includes(link)) queue.push(link)
  }
}

await mkdir(dirname(OUT), { recursive: true })
await writeFile(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: ORIGIN,
      pages: pageCount,
      chunks,
    },
    null,
    2,
  ),
)
console.log(`\nwrote ${OUT}\n  pages: ${pageCount}\n  chunks: ${chunks.length}`)

// --- helpers ---

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(stripTags(m[1])).trim() : null
}

function extractLinks(html, fromPath) {
  const out = []
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi
  let m
  while ((m = re.exec(html))) {
    const href = m[1]
    if (href.startsWith('mailto:') || href.startsWith('javascript:')) continue
    let path
    if (href.startsWith('http://') || href.startsWith('https://')) {
      const u = new URL(href)
      if (u.origin !== ORIGIN) continue
      path = u.pathname + (u.search || '')
    } else if (href.startsWith('/')) {
      path = href
    } else {
      // Resolve relative path against fromPath's directory.
      const base = fromPath.endsWith('/') ? fromPath : fromPath.replace(/\/[^/]*$/, '/')
      path = new URL(href, ORIGIN + base).pathname
    }
    if (/\.(png|jpg|jpeg|gif|svg|ico|css|js|json|xml|pdf|zip)$/i.test(path)) continue
    out.push(path)
  }
  return out
}

// Strip <script>/<style>/<nav>/<header>/<footer>, then split body into
// (heading, body-text) sections at every h1/h2/h3.
function extractSections(html) {
  let body = html.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  body = body.replace(/<style\b[\s\S]*?<\/style>/gi, '')
  body = body.replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
  body = body.replace(/<header\b[\s\S]*?<\/header>/gi, '')
  body = body.replace(/<footer\b[\s\S]*?<\/footer>/gi, '')

  const main = body.match(/<main\b[\s\S]*?<\/main>/i) || body.match(/<article\b[\s\S]*?<\/article>/i)
  const region = main ? main[0] : body

  const sections = []
  let current = { heading: 'Introduction', body: '' }
  const tokenRe = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>|<\/?[a-z][^>]*>|[^<]+/gi
  let m
  while ((m = tokenRe.exec(region))) {
    if (m[1]) {
      if (current.body.trim()) sections.push(current)
      current = { heading: decodeEntities(stripTags(m[2])).trim(), body: '' }
    } else if (m[0].startsWith('<')) {
      // Treat block tags as paragraph breaks so we don't smash words together.
      if (/^<\/?(p|div|li|tr|td|th|br|h[1-6]|section|article|pre|blockquote)\b/i.test(m[0])) {
        current.body += '\n'
      }
    } else {
      current.body += decodeEntities(m[0])
    }
  }
  if (current.body.trim()) sections.push(current)
  return sections
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '')
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function chunkText(text, targetWords) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  const words = cleaned.split(' ')
  if (words.length <= targetWords * 1.5) return [cleaned]
  const out = []
  for (let i = 0; i < words.length; i += targetWords) {
    out.push(words.slice(i, i + targetWords).join(' '))
  }
  return out
}
