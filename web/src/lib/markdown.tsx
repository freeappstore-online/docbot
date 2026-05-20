// Tiny markdown renderer for chat bubbles. Covers what Claude actually emits
// in short answers: paragraphs, bullet/ordered lists, **bold**, *italic*,
// `code`, and [links](url). React handles escaping — no innerHTML, no XSS.
//
// Block grammar: split on blank lines into blocks. A block whose lines all
// start with "- " / "* " / "1. " becomes a list; everything else is a paragraph.

import type { ReactNode } from 'react'

export function renderMarkdown(src: string): ReactNode {
  const blocks = src.replace(/\r\n/g, '\n').split(/\n\s*\n/)
  return blocks.map((block, i) => {
    const trimmed = block.trim()
    if (!trimmed) return null

    const lines = trimmed.split('\n')
    const isUL = lines.every((l) => /^[-*]\s+/.test(l))
    const isOL = lines.every((l) => /^\d+\.\s+/.test(l))

    if (isUL || isOL) {
      const items = lines.map((l) => l.replace(/^([-*]|\d+\.)\s+/, ''))
      const Tag = isOL ? 'ol' : 'ul'
      return (
        <Tag key={i} className={isOL ? 'ml-5 list-decimal space-y-1' : 'ml-5 list-disc space-y-1'}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      )
    }

    return (
      <p key={i} className="whitespace-pre-wrap leading-relaxed [&:not(:first-child)]:mt-2">
        {renderInline(trimmed)}
      </p>
    )
  })
}

// Inline rules. Code first (so ** inside backticks doesn't bold), then links,
// then bold, then italic. Each rule consumes from `rest`; whatever's left
// continues to the next rule.
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let rest = text
  let key = 0

  const patterns: Array<{ re: RegExp; node: (m: RegExpExecArray) => ReactNode }> = [
    { re: /`([^`]+)`/, node: (m) => <code className="rounded bg-[var(--paper-deep)] px-1 font-mono text-[0.85em]">{m[1]}</code> },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      node: (m) => (
        <a href={m[2]} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]">
          {m[1]}
        </a>
      ),
    },
    { re: /\*\*([^*]+)\*\*/, node: (m) => <strong>{m[1]}</strong> },
    { re: /__([^_]+)__/, node: (m) => <strong>{m[1]}</strong> },
    { re: /\*([^*\n]+)\*/, node: (m) => <em>{m[1]}</em> },
    { re: /_([^_\n]+)_/, node: (m) => <em>{m[1]}</em> },
  ]

  while (rest) {
    let earliest: { idx: number; m: RegExpExecArray; pat: (typeof patterns)[number] } | null = null
    for (const pat of patterns) {
      const m = pat.re.exec(rest)
      if (m && (earliest === null || m.index < earliest.idx)) {
        earliest = { idx: m.index, m, pat }
      }
    }
    if (!earliest) {
      out.push(rest)
      break
    }
    if (earliest.idx > 0) out.push(rest.slice(0, earliest.idx))
    out.push(<span key={key++}>{earliest.pat.node(earliest.m)}</span>)
    rest = rest.slice(earliest.idx + earliest.m[0].length)
  }

  return out
}
