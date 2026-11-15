// A tab's views as its page and its menu read them: one cache per tab, kept while it is open. A path is read once however
// many read it; what the page was served with seeds it; a change of the surface reads again what is watched, in place,
// and marks the rest stale, read again when next watched. A read that fails keeps the view it had, with why. A first read
// is a promise that never rejects, so a page waits on it (useLive in tab.tsx) and is shown once, whole.

/** What is known at a path: its view, or why it could not be read, or both where a later read failed. */
export type Entry<V = unknown> = { view?: V; error?: string }

export type LiveCache = {
  /** What is known at `path`, the same object until it changes; undefined before its first read lands. */
  get(path: string): Entry | undefined
  /** Reads `path` unless a read is out; resolves when it is known, never rejects. */
  load(path: string): Promise<void>
  /** What was read elsewhere, as the page's boot: taken where nothing is known yet. */
  seed(path: string, view: unknown): void
  /** Told each time `path` changes; watching a path not yet read, or stale, reads it. */
  subscribe(path: string, fn: () => void): () => void
  /** The surface changed: what is watched is read again, the rest is stale. */
  changed(): void
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function liveCache(fetch: (path: string) => Promise<unknown>): LiveCache {
  const entries = new Map<string, Entry>()
  const stale = new Set<string>()
  const pending = new Map<string, Promise<void>>()
  // Paths that changed while a read was out: that read may have been answered before, so they are read once more after it.
  const again = new Set<string>()
  const listeners = new Map<string, Set<() => void>>()
  const watched = (path: string) => (listeners.get(path)?.size ?? 0) > 0
  const tell = (path: string) => {
    for (const fn of [...(listeners.get(path) ?? [])]) fn()
  }
  const load = (path: string): Promise<void> => {
    const out = pending.get(path)

    if (out) return out
    stale.delete(path)

    const read = fetch(path)
      .then(
        (view) => void entries.set(path, { view }),
        (error: unknown) => void entries.set(path, { ...entries.get(path), error: message(error) })
      )
      .then(() => {
        pending.delete(path)
        tell(path)
        if (again.delete(path)) refresh(path)
      })

    pending.set(path, read)

    return read
  }
  const refresh = (path: string) => {
    if (pending.has(path)) again.add(path)
    else void load(path)
  }

  return {
    get: (path) => entries.get(path),
    load,
    seed(path, view) {
      if (!entries.has(path) && view !== undefined) entries.set(path, { view })
    },
    subscribe(path, fn) {
      let fns = listeners.get(path)

      if (!fns) listeners.set(path, (fns = new Set()))
      fns.add(fn)
      if (stale.has(path) || (!entries.has(path) && !pending.has(path))) void load(path)

      return () => void fns.delete(fn)
    },
    changed() {
      for (const path of new Set([...entries.keys(), ...pending.keys()])) {
        if (watched(path)) refresh(path)
        else if (pending.has(path)) again.add(path)
        else stale.add(path)
      }
    },
  }
}

/** One cache per key, made as first asked for; `keep` drops the others' caches, as their tabs close. */
export function cachesBy(make: (key: string) => LiveCache) {
  const caches = new Map<string, LiveCache>()

  return {
    of(key: string): LiveCache {
      let cache = caches.get(key)

      if (!cache) caches.set(key, (cache = make(key)))

      return cache
    },
    changed() {
      for (const cache of caches.values()) cache.changed()
    },
    keep(keys: readonly string[]) {
      for (const key of caches.keys()) if (!keys.includes(key)) caches.delete(key)
    },
  }
}

/** What a page reading `path` is shown: what is known there, else what it showed before at another path; nothing yet means it waits. */
export function shownOf<V>(entry: Entry<V> | undefined, before: Entry<V> | undefined): Entry<V> | undefined {
  if (entry && (entry.view !== undefined || entry.error !== undefined)) return entry

  return before
}
