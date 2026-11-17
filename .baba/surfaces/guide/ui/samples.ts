// What the shell's specimens are drawn from: a queue-like surface's views, as a tab's menu reads them, and a session's
// activity, as a drawer's thread reads it. Sample data only; every list and dot made of it is the shell's own code's.
import { handle, type View } from "../../../../framework/core/surface/view.ts"
import type { ClosedTab, Row } from "../../../../framework/shell/ui/thread.ts"
import { liveCache } from "../../../../framework/shell/ui/live.ts"
import type { Door } from "../../../../framework/shell/ui/tab.tsx"

const TITLES = ["Keep the present short", "Rename the picker", "Close a tab from its menu", "Show the present", "Fold the injections", "Pin the tellings", "Approve a draft", "Show whose move it is", "Name the lanes", "Count what waits"]
const issue = (n: number) => ({ at: `/issues/${n}`, n, title: TITLES[n - 1]! })

/** A queue's views, by path within its tab: issues to go to, actions at / and at an issue, approve at issue 4 and at issue 7. */
export const VIEWS: Record<string, View> = {
  "/": {
    title: "Queue",
    issues: TITLES.map((_, i) => issue(i + 1)),
    add: handle("add", "Add an issue the person asked for to the bottom of the backlog", {}, { title: "string", about: "string" }),
    draft: handle("draft", "Suggest an issue the person has not asked for, as a draft", {}, { title: "string", about: "string" }),
  },
  ...Object.fromEntries(
    TITLES.map((title, i) => {
      const n = i + 1
      const subject = { n }

      return [
        `/issues/${n}`,
        {
          title,
          n,
          from: n > 1 ? [issue(n - 1)] : [],
          to: n < TITLES.length ? [issue(n + 3 > TITLES.length ? TITLES.length : n + 3)] : [],
          menu: [
            { label: "Move", actions: ["start", "done"] },
            { label: "Edit", actions: ["describe", "note"] },
          ],
          ...((n === 4 || n === 7) && { approve: handle("approve", `Approve draft ${n}: it joins the backlog`, subject) }),
          start: handle("start", `Give issue ${n} to a lane, 1 to 5`, subject, { lane: "number" }),
          done: handle("done", `Mark issue ${n} done`, subject),
          describe: handle("describe", `Rewrite what issue ${n} is about, as brief markdown`, subject, { about: "string" }),
          note: handle("note", `Say where issue ${n} stands in one line`, subject, { text: "string" }),
          drop: handle("drop", `Remove issue ${n}: it will not be done`, subject),
        },
      ]
    })
  ),
}

/** A door to the views above, in place of a tab's: read from them, and every call refused, as a sample's. */
export function sampleDoor(views: Record<string, View> = VIEWS): Door {
  const at = async (path = "/") => {
    const view = views[path]

    if (!view) throw new Error(`there is nothing at ${path}`)

    return view
  }

  return {
    cache: liveCache(at),
    read: (async (path?: string) => at(path)) as Door["read"],
    call: (async () => ({ outcome: "refused", reason: "this is a sample" })) as Door["call"],
    live: () => () => {},
  }
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d+Z$/, "Z")

/**
 * A session's activity, newest first: in the queue's tab, two highlights, the agent's and the surface's, and between them
 * ordinary entries: notices by the agent and the person, each with what was done; one command's calls, a batch, stopped
 * by a refusal; calls in a row, a refusal on its own, events of the world in a row, and the shell's line that it was
 * opened; the shell's own lines, about tabs opened and closed.
 */
export const ROWS: Row[] = [
  { n: 24, when: ago(0), who: "agent", surface: "queue", at: "/queue/issues/4", did: "done n=4", said: ["Issue 4, Show the present, is done"] },
  { n: 23, when: ago(0), who: "agent", surface: "queue", at: "/queue/issues/4", did: 'note n=4 text="specs pass, merging"' },
  { n: 22, when: ago(1), who: "agent", surface: "queue", at: "/queue/issues/7", did: 'highlight at=/queue/issues/7 why="Draft 7 waits on you" front=false', said: ["Draft 7 waits on you"], highlight: true },
  { n: 21, when: ago(2), who: "agent", surface: "queue", at: "/queue/issues/6", did: "start n=6 lane=2", refused: "lane 2 is busy with issue 5", id: "c41" },
  { n: 20, when: ago(2), who: "agent", surface: "queue", at: "/queue/issues/5", did: "start n=5 lane=2", said: ["Issue 5 is in lane 2"], id: "c41" },
  { n: 19, when: ago(2), who: "agent", surface: "queue", at: "/queue/issues/3", did: "note n=3 text=reviewed", id: "c41" },
  { n: 18, when: ago(2), who: "agent", surface: "queue", at: "/queue/issues/2", did: "note n=2 text=reviewed", id: "c41" },
  { n: 17, when: ago(2), who: "agent", surface: "queue", at: "/queue/issues/1", did: "done n=1", id: "c41" },
  { n: 16, when: ago(3), who: "agent", surface: "queue", at: "/queue/issues/4", did: "start n=4 lane=2", refused: "lane 2 is busy with issue 5" },
  { n: 15, when: ago(4), who: "world", by: "watch", surface: "queue", at: "/queue", did: "changed", times: 3 },
  { n: 14, when: ago(5), who: "person", surface: "queue", at: "/queue/issues/7", did: "approve n=7", said: ["Draft 7 approved: it joins the backlog"] },
  { n: 13, when: ago(6), who: "person", surface: "queue", at: "/queue/issues/8", did: "drop n=8" },
  { n: 9, when: ago(8), who: "world", by: "lanes", surface: "queue", at: "/queue", did: "freed", said: ["Lane 2 is free again"], highlight: true },
  {
    n: 8,
    when: ago(40),
    who: "agent",
    surface: "queue",
    at: "/queue/issues/4",
    did: "iterate n=4",
    said: ["Issue 4 begins iteration 2: the dots stand on the icon, and the drawer opens where the rail is"],
  },
  { n: 7, when: ago(42), who: "agent", surface: "queue", at: "/queue/issues/4", did: "describe n=4" },
  { n: 6, when: ago(45), who: "person", surface: "queue", at: "/queue", own: true, did: "open surface=queue" },
  { n: 5, when: ago(50), who: "agent", surface: "lab", at: null, own: true, did: "close n=2" },
  { n: 4, when: ago(80), who: "agent", surface: "lab", at: null, own: true, did: "open surface=lab" },
  { n: 3, when: ago(90), who: "agent", surface: "design", at: "/design", own: true, did: "open surface=design" },
]
/** The highlights the person had not opened as the drawer opened, by number. */
export const FRESH = [22, 9]

/** The session's closed tabs, the latest closed first, as /activity/closed lists them. */
export const CLOSED_TABS: ClosedTab[] = [
  { n: 2, surface: "lab", title: "Run the eval on the drawer", opened: ago(80), closed: ago(50), by: "agent", entries: 6, at: "/activity/closed/2" },
  { n: 1, surface: "queue", opened: ago(300), closed: ago(200), by: "person", entries: 2, at: "/activity/closed/1" },
  ...Array.from({ length: 58 }, (_, i): ClosedTab => ({ n: 100 + i, surface: i % 2 ? "notes" : "design", closed: ago(600 + i * 90), by: "shell", entries: 1, at: `/activity/closed/${100 + i}` })),
]

/** A closed lab tab's log, newest first, as /activity/closed/2 gives it: its places by the address it had. */
const LAB_LOG: Row[] = [
  { n: 6, when: ago(51), who: "world", by: "run", surface: "lab", at: "/tabs/2", did: "ended", said: ["The run ended: 2 turns, 41s"], highlight: true },
  { n: 5, when: ago(55), who: "world", by: "run", surface: "lab", at: "/tabs/2", did: "turn", times: 2 },
  { n: 4, when: ago(70), who: "agent", surface: "lab", at: "/tabs/2", did: "start model=sonnet", said: ["A run starts on the drawer's checkout"] },
  { n: 3, when: ago(72), who: "agent", surface: "lab", at: "/tabs/2", did: "pick variant=drawer" },
  { n: 2, when: ago(75), who: "person", surface: "lab", at: "/tabs/2", did: "name text=drawer" },
]

/** The archive of closed tabs as home's drawer reads it, a page at a time: the list, and each tab's log. */
export function sampleArchive(): <V>(path: string) => Promise<V> {
  const PAGE = 50

  return async <V>(path: string): Promise<V> => {
    const at = path.split("#")[0]!
    const page = /^\/activity\/closed(?:\/page\/(\d+))?$/.exec(at)

    if (page) {
      const k = Number(page[1] ?? 0)

      return { kept: CLOSED_TABS.length, tabs: CLOSED_TABS.slice(k, k + PAGE), ...(k + PAGE < CLOSED_TABS.length && { earlier: { at: `/activity/closed/page/${k + PAGE}` } }) } as V
    }

    return { entries: at === "/activity/closed/2" ? LAB_LOG : [{ n: 1, when: ago(301), who: "person", surface: "queue", at: "/tabs/1", did: "add title=x" }] } as V
  }
}
