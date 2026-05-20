import MiniSearch from 'minisearch'

export interface Chunk {
  id: string
  url: string
  title: string
  heading: string
  text: string
}

interface KbFile {
  generatedAt: string
  source: string
  pages: number
  chunks: Chunk[]
}

let cached: { search: MiniSearch<Chunk>; byId: Map<string, Chunk>; meta: Omit<KbFile, 'chunks'> } | null = null

export async function loadKb() {
  if (cached) return cached
  const res = await fetch('/kb.json')
  if (!res.ok) throw new Error(`kb.json failed: ${res.status}`)
  const file = (await res.json()) as KbFile

  const search = new MiniSearch<Chunk>({
    fields: ['title', 'heading', 'text'],
    storeFields: ['id'],
    searchOptions: {
      boost: { title: 2, heading: 1.5 },
      fuzzy: 0.15,
      prefix: true,
    },
  })
  search.addAll(file.chunks)
  const byId = new Map(file.chunks.map((c) => [c.id, c]))

  cached = { search, byId, meta: { generatedAt: file.generatedAt, source: file.source, pages: file.pages } }
  return cached
}

export async function retrieve(query: string, k = 5): Promise<Chunk[]> {
  const { search, byId } = await loadKb()
  const hits = search.search(query, { combineWith: 'OR' }).slice(0, k)
  const out: Chunk[] = []
  for (const h of hits) {
    const chunk = byId.get(h.id as string)
    if (chunk) out.push(chunk)
  }
  return out
}
