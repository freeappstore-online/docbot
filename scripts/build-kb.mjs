#!/usr/bin/env node
// Crawls freeappstore.pages.dev, strips HTML to text, chunks each page, and
// writes web/public/kb.json. Re-run whenever upstream docs change.
//
// Output shape: { generatedAt, source, chunks: [{ id, url, title, heading, text }] }
//
// Pure helpers live in ./kb-helpers.mjs so the test suite can import them
// without triggering this crawl.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  canonicalPath,
  chunkText,
  extractLinks,
  extractSections,
  extractTitle,
} from './kb-helpers.mjs'

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
  const path = canonicalPath(raw)
  if (seen.has(path)) continue
  seen.add(path)

  const url = ORIGIN + path
  let html
  let finalPath = path
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'docbot-kb-builder/0.1' } })
    if (!res.ok) {
      console.warn(`skip ${url} (${res.status})`)
      continue
    }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html')) continue
    // If the server redirected (res.url differs), canonicalize the resolved
    // path and skip if we've already crawled it.
    try {
      const resolvedUrl = new URL(res.url)
      if (resolvedUrl.origin === ORIGIN) {
        finalPath = canonicalPath(resolvedUrl.pathname)
        if (finalPath !== path) {
          if (seen.has(finalPath)) continue
          seen.add(finalPath)
        }
      }
    } catch {
      // res.url unparseable — keep using requested path.
    }
    html = await res.text()
  } catch (err) {
    console.warn(`fetch failed ${url}: ${err.message}`)
    continue
  }

  pageCount++
  const title = extractTitle(html) || finalPath
  const sections = extractSections(html)

  let totalChunks = 0
  for (const section of sections) {
    for (const text of chunkText(section.body, CHUNK_WORDS)) {
      chunks.push({
        id: `${finalPath}#${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${totalChunks}`,
        url: ORIGIN + finalPath,
        title,
        heading: section.heading,
        text,
      })
      totalChunks++
    }
  }
  console.log(`crawled ${finalPath} → ${totalChunks} chunks (${title})`)

  for (const link of extractLinks(html, finalPath, ORIGIN)) {
    const canon = canonicalPath(link)
    if (!seen.has(canon) && !queue.includes(canon)) queue.push(canon)
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
