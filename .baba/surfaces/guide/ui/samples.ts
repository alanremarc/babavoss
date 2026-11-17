// What the shell's specimens are drawn from: a queue-like surface's views, as a tab's menu reads them, and a session's
// activity, as a drawer's thread reads it. Sample data only; every list and dot made of it is the shell's own code's.
import { handle, type View } from "../../../../framework/core/surface/view.ts"
import type { Row } from "../../../../framework/shell/ui/thread.ts"
import { liveCache } from "../../../../framework/shell/ui/live.ts"
import type { Door } from "../../../../framework/shell/ui/tab.tsx"

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

/**
 * A session's activity, newest first: in the queue's tab, notices by the agent, the world and the person, each with what
 * was done, calls in a row by the agent, a refusal, events of the world in a row, and the shell's line that it was opened;
 * the shell's own lines, about tabs opened and closed.
 */
export const ROWS: Row[] = [
  { n: 16, when: ago(1), who: "agent", surface: "queue", at: "/queue/issues/4", did: "done n=4", said: ["Issue 4, Show the present, is done"] },
  { n: 15, when: ago(2), who: "agent", surface: "queue", at: "/queue/issues/4", did: 'note n=4 text="specs pass, merging"' },
  { n: 14, when: ago(2), who: "agent", surface: "queue", at: "/queue/issues/4", did: "start n=4 lane=2", refused: "lane 2 is busy with issue 5" },
  { n: 13, when: ago(3), who: "agent", surface: "queue", at: "/queue/issues/5", did: "start n=5 lane=2" },
  { n: 12, when: ago(4), who: "world", by: "watch", surface: "queue", at: "/queue", did: "changed", times: 3 },
  { n: 10, when: ago(5), who: "person", surface: "queue", at: "/queue/issues/7", did: "approve n=7", said: ["Draft 7 approved: it joins the backlog"] },
  { n: 9, when: ago(8), who: "world", by: "lanes", surface: "queue", at: "/queue", did: "freed", said: ["Lane 2 is free again"] },
  {
    n: 8,
    when: ago(40),
    who: "agent",
    surface: "queue",
    at: "/queue/issues/4",
    did: "iterate n=4",
    said: ["Issue 4 begins iteration 2: the dots stand on the icon, and the drawer opens where the rail is"],
  },
  { n: 7, when: ago(41), who: "person", surface: "queue", at: "/queue", own: true, did: "show at=/queue" },
  { n: 6, when: ago(45), who: "person", surface: "queue", at: "/queue", own: true, did: "open surface=queue" },
  { n: 5, when: ago(50), who: "agent", surface: "lab", at: null, own: true, did: "close n=2" },
  { n: 4, when: ago(80), who: "agent", surface: "lab", at: null, own: true, did: "open surface=lab" },
  { n: 3, when: ago(90), who: "agent", surface: "design", at: "/design", own: true, did: "open surface=design" },
]
/** The notices the person had not seen as the drawer opened, by number. */
export const FRESH = [16, 9]
