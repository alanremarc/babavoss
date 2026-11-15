// What the shell's specimens are drawn from: a queue-like surface's views, as a tab's menu reads them, and a session's
// activity, as the drawer lists it. Sample data only; every list and dot made of it is the shell's own code's.
import { handle, type View } from "babavoss/core/surface/view.ts"
import type { Need, Row, TabInfo } from "babavoss/shell/ui/channels.ts"
import { liveCache } from "babavoss/shell/ui/live.ts"
import type { Door } from "babavoss/shell/ui/tab.tsx"

const TITLES = ["Keep the present short", "Rename the picker", "Close a tab from its menu", "Show the present", "Fold the injections", "Pin the tellings", "Approve a draft", "Show whose move it is", "Name the lanes", "Count what waits"]
const issue = (n: number) => ({ at: `/issues/${n}`, n, title: TITLES[n - 1]! })

/** A queue's views, by path within its tab: issues to go to, actions at / and at an issue, an ask at issue 4 and at issue 7. */
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
          ...((n === 4 || n === 7) && { approve: handle("approve", `Approve draft ${n}: it joins the backlog`, subject, {}, true) }),
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

/** The open tabs, as the strip shows them. */
export const TABS: TabInfo[] = [
  { at: "/queue", surface: "queue", label: "Queue" },
  { at: "/tabs/3", surface: "lab", label: "Lab" },
  { at: "/design", surface: "design", label: "Design" },
]
/** What the tabs need of the person. */
export const NEEDS: Need[] = [{ at: "/queue", surface: "queue", who: "person", why: "to approve or drop 1 draft" }]
/** A session's activity, newest first: notices, calls, the shell's own, and a closed tab's. */
export const ROWS: Row[] = [
  { n: 12, when: ago(1), who: "agent", kind: "notice", surface: "queue", at: "/queue/issues/4", tab: "/queue", what: "Issue 4, Show the present, is done" },
  { n: 11, when: ago(2), who: "person", kind: "call", surface: "queue", at: "/queue/issues/7", tab: "/queue", what: "approve n=7" },
  { n: 10, when: ago(4), who: "surface", kind: "notice", surface: "lab", at: "/tabs/3", tab: "/tabs/3", what: "The run ended: 2 turns, 41s, $0.08" },
  { n: 9, when: ago(6), who: "person", kind: "call", surface: "design", at: "/design/scenarios/start/2", tab: "/design", what: "pin" },
  { n: 8, when: ago(30), who: "agent", kind: "call", surface: "queue", at: "/queue/issues/4", tab: "/queue", what: 'note n=4 text="specs pass, merging"' },
  {
    n: 7,
    when: ago(50),
    who: "agent",
    kind: "notice",
    surface: "queue",
    at: "/queue/issues/4",
    tab: "/queue",
    what: "Issue 4 begins iteration 2: rewrite the strip so the dots stand on the icon and the menu hangs from the same spot whenever it opens",
  },
  { n: 6, when: ago(200), who: "agent", kind: "notice", surface: "design", at: "/design", tab: "/design", what: "The tellings are pinned as the baseline" },
  { n: 5, when: ago(60 * 26), who: "agent", kind: "call", surface: "lab", at: "/", what: "Opened Lab" },
  { n: 4, when: ago(60 * 27), who: "surface", kind: "notice", surface: "lab", at: null, tab: "/tabs/2", what: "Run 2 ended" },
]
/** The notices the person has not seen, by number. */
export const FRESH = [12, 10]
/** A closed tab's title, which names its channel. */
export const TITLES_BY_TAB = { "/tabs/2": "Lab 2" }
