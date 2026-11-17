// What a refresh shows: the paths the page is served with, the island read back, and a tab's cache of views: a path read
// once however many read it, a seed taken as known, a change read again in place where it is watched and stale elsewhere,
// a failed read keeping its view; what a page is shown while its path moves; and when the stream's state is said.
import { describe, expect, it } from "bun:test"
import { bootPaths } from "../../framework/shell/src/boot.ts"
import { parseBoot } from "../../framework/shell/ui/boot.ts"
import { said } from "../../framework/shell/ui/connection.tsx"
import { cachesBy, liveCache, shownOf } from "../../framework/shell/ui/live.ts"

/** A door whose reads are answered by hand, in any order. */
const door = () => {
  const asked: { path: string; answer: (view: unknown) => void; fail: (why: string) => void }[] = []
  const fetch = (path: string) => new Promise<unknown>((answer, fail) => asked.push({ path, answer, fail: (why) => fail(new Error(why)) }))

  return { asked, fetch }
}
const settled = () => new Promise((done) => setTimeout(done, 0))

describe("the page's boot", () => {
  it("names the shell, its notices, and a tab's views at its / and its route, for the page's path", () => {
    expect(bootPaths("/")).toEqual(["/", "/activity/notices"])
    expect(bootPaths("/activity")).toEqual(["/", "/activity/notices"])
    expect(bootPaths("/settings")).toEqual(["/", "/activity/notices", "/settings"])
    expect(bootPaths("/queue/issues/40")).toEqual(["/", "/activity/notices", "/queue", "/queue/issues/40"])
    expect(bootPaths("/tabs/3")).toEqual(["/", "/activity/notices", "/tabs/3"])
    expect(bootPaths("/tabs/3/issues/40")).toEqual(["/", "/activity/notices", "/tabs/3", "/tabs/3/issues/40"])
  })

  it("reads the island back, and nothing where there is none or it does not read", () => {
    expect(parseBoot('{"version":4,"turn":{"agent":"idle","since":1,"waiting":0,"drivable":false},"views":{"/":{"title":"baba"}}}')).toEqual({
      version: 4,
      turn: { agent: "idle", since: 1, waiting: 0, drivable: false },
      views: { "/": { title: "baba" } },
    })
    expect(parseBoot(undefined)).toEqual({ views: {} })
    expect(parseBoot("</script>")).toEqual({ views: {} })
    expect(parseBoot("null")).toEqual({ views: {} })
  })
})

describe("a tab's cache of views", () => {
  it("reads a path once however many wait on it, and tells each who watches", async () => {
    const { asked, fetch } = door()
    const cache = liveCache(fetch)
    let told = 0

    cache.subscribe("/", () => told++)
    void cache.load("/")
    void cache.load("/")
    expect(asked.map((a) => a.path)).toEqual(["/"])
    asked[0]!.answer({ n: 1 })
    await settled()
    expect([cache.get("/"), told]).toEqual([{ view: { n: 1 } }, 1])
  })

  it("takes what the page was served as known, so nothing is read until it changes", async () => {
    const { asked, fetch } = door()
    const cache = liveCache(fetch)

    cache.seed("/", { n: 1 })
    cache.subscribe("/", () => {})
    expect([cache.get("/"), asked.length]).toEqual([{ view: { n: 1 } }, 0])

    cache.changed()
    expect(asked.map((a) => a.path)).toEqual(["/"])
    // Shown in place until the new view lands.
    expect(cache.get("/")).toEqual({ view: { n: 1 } })
    asked[0]!.answer({ n: 2 })
    await settled()
    expect(cache.get("/")).toEqual({ view: { n: 2 } })
  })

  it("reads again on a change only what is watched; the rest is stale and read when next watched", async () => {
    const { asked, fetch } = door()
    const cache = liveCache(fetch)

    cache.seed("/", { n: 1 })
    cache.seed("/issues/2", { n: 2 })

    const off = cache.subscribe("/issues/2", () => {})

    off()
    cache.subscribe("/", () => {})
    cache.changed()
    expect(asked.map((a) => a.path)).toEqual(["/"])

    cache.subscribe("/issues/2", () => {})
    expect(asked.map((a) => a.path)).toEqual(["/", "/issues/2"])
  })

  it("reads once more a path that changed while it was being read", async () => {
    const { asked, fetch } = door()
    const cache = liveCache(fetch)

    cache.subscribe("/", () => {})
    cache.changed()
    expect(asked.length).toBe(1)
    asked[0]!.answer({ n: 1 })
    await settled()
    expect(asked.length).toBe(2)
    asked[1]!.answer({ n: 2 })
    await settled()
    expect(cache.get("/")).toEqual({ view: { n: 2 } })
  })

  it("keeps the view it had where a later read fails, with why; a first read that fails is known by its error", async () => {
    const { asked, fetch } = door()
    const cache = liveCache(fetch)

    cache.seed("/", { n: 1 })
    cache.subscribe("/", () => {})
    cache.changed()
    asked[0]!.fail("gone")
    await settled()
    expect(cache.get("/")).toEqual({ view: { n: 1 }, error: "gone" })

    const first = cache.load("/nowhere")

    asked[1]!.fail("nothing at /nowhere")
    await first
    expect(cache.get("/nowhere")).toEqual({ error: "nothing at /nowhere" })
  })

  it("is one per tab, made as first asked for and dropped as the tab closes", () => {
    let made = 0
    const caches = cachesBy(() => (made++, liveCache(async () => ({}))))
    const first = caches.of("/tabs/1")

    expect([caches.of("/tabs/1") === first, made]).toEqual([true, 1])
    caches.keep(["/tabs/2"])
    expect(caches.of("/tabs/1") === first).toBe(false)
  })
})

describe("what a page is shown", () => {
  it("is what is known at its path, else what it showed before; nothing yet means it waits", () => {
    const before = { view: { n: 2 } }

    expect(shownOf({ view: { n: 3 } }, before)).toEqual({ view: { n: 3 } })
    expect(shownOf({ error: "nothing at /issues/9" }, before)).toEqual({ error: "nothing at /issues/9" })
    expect(shownOf(undefined, before)).toBe(before)
    expect(shownOf(undefined, undefined)).toBeUndefined()
  })
})

describe("the page's stream", () => {
  it("says nothing while it is up or a load is normal, and only a loss that lasts", () => {
    expect([said("up", 60_000), said("connecting", 1000), said("lost", 500)]).toEqual([undefined, undefined, undefined])
    expect([said("lost", 700), said("connecting", 4000)]).toEqual(["Reconnecting", "Connecting"])
  })
  it("says at once that its runtime is asleep, and that the agent wakes it", () => {
    expect(said("asleep", 0)).toBe("Asleep; it wakes when the agent next works with it")
  })
})

describe("a runtime out of reach", () => {
  it("leaves a view that was read as it is, with no error, and reads it again when asked", async () => {
    let reach = true
    let n = 0
    const cache = liveCache(async (path) => {
      if (!reach) throw new TypeError("Failed to fetch")

      return { path, n: ++n }
    })

    await cache.load("/a")
    reach = false
    await cache.load("/a")
    expect(cache.get("/a")).toEqual({ view: { path: "/a", n: 1 } })
    // A path never read has nothing else to show.
    await cache.load("/b")
    expect(cache.get("/b")).toEqual({ error: "Failed to fetch" })
    reach = true
    await cache.load("/a")
    expect(cache.get("/a")).toEqual({ view: { path: "/a", n: 2 } })
  })
})
