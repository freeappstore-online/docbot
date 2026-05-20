// Node 26 ships an experimental built-in `localStorage` that needs a
// --localstorage-file flag to work. Because it pre-exists on globalThis,
// Vitest 4's happy-dom integration sees it as "already present" and skips
// copying happy-dom's working localStorage in (vitest filters out keys that
// already exist on the global). This setup file runs after the happy-dom
// environment is wired up; we forcibly install a working localStorage backed
// by an in-memory store, scoped to the current test (vitest tears the global
// down between files, so this re-runs).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = globalThis

function makeStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

// Override both globalThis and the happy-dom window. The previous descriptor
// is non-configurable on Node 26, but `defineProperty` with `configurable: true`
// will replace it.
function install(target: object, name: 'localStorage' | 'sessionStorage') {
  let current: Storage = makeStorage()
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    get() {
      return current
    },
    set(v: Storage) {
      current = v
    },
  })
}

install(g, 'localStorage')
install(g, 'sessionStorage')

if (g.window && g.window !== g) {
  install(g.window, 'localStorage')
  install(g.window, 'sessionStorage')
}
