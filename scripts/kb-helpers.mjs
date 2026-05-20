// Pure helpers used by build-kb.mjs. Extracted so they can be imported (and
// unit-tested) without triggering the crawler's top-level await fetch loop.

export function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(stripTags(m[1])).trim() : null
}

// Path canonicalization shared between the crawl loop and any post-fetch
// dedupe (e.g., when the server redirects /foo → /foo/).
export function canonicalPath(rawPath) {
  let path = rawPath.split('#')[0].split('?')[0]
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1)
  if (path.endsWith('.html')) path = path.slice(0, -5) || '/'
  return path
}

export function extractLinks(html, fromPath, origin) {
  const out = []
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi
  let m
  while ((m = re.exec(html))) {
    // Decode HTML entities in the attribute value before treating it as a URL —
    // e.g., href="/foo?a=1&amp;b=2" should become "/foo?a=1&b=2".
    const href = decodeEntities(m[1])
    if (
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:') ||
      href.startsWith('data:')
    ) continue
    let path
    try {
      if (href.startsWith('http://') || href.startsWith('https://')) {
        const u = new URL(href)
        if (u.origin !== origin) continue
        path = u.pathname + (u.search || '')
      } else if (href.startsWith('//')) {
        const u = new URL('https:' + href)
        if (u.origin !== origin) continue
        path = u.pathname + (u.search || '')
      } else if (href.startsWith('/')) {
        path = href
      } else {
        // Resolve relative path against fromPath's directory.
        const base = fromPath.endsWith('/') ? fromPath : fromPath.replace(/\/[^/]*$/, '/')
        const resolved = new URL(href, origin + base)
        path = resolved.pathname + (resolved.search || '')
      }
    } catch {
      // Malformed URL — skip.
      continue
    }
    if (/\.(png|jpg|jpeg|gif|svg|ico|css|js|json|xml|pdf|zip)$/i.test(path)) continue
    out.push(path)
  }
  return out
}

// Strip <script>/<style>/<nav>/<header>/<footer>, then split body into
// (heading, body-text) sections at every h1/h2/h3.
export function extractSections(html) {
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

export function stripTags(s) {
  return s.replace(/<[^>]+>/g, '')
}

export function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

export function chunkText(text, targetWords) {
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
