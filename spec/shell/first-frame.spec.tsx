// A refresh's first frame, drawn from the island the page was served with before anything is read: the rail with every
// tab, in the order it stands, the one at the address selected, whose move it is, and that tab's page with its views, never an empty state.
import { describe, expect, it } from "bun:test"
import { renderToString } from "react-dom/server"
import { BOOT_ID } from "../../framework/core/runtime/boot.ts"

const tab = (n: number, surface: string, title: string) => ({ at: `/tabs/${n}`, n, surface, title, close: { kind: "handle", name: "close", args: { n }, open: {} } })
const served = {
  version: 7,
  turn: { agent: "working", since: 1, waiting: 0, drivable: false },
  views: {
    "/": { title: "baba", surfaces: [], tabs: [tab(1, "notes", "Notes"), tab(2, "queue", "Queue")], needs: [{ at: "/tabs/1", surface: "notes", who: "person", why: "to decide" }] },
    "/activity/notices": { entries: [], unseen: 0 },
    "/tabs/2": { issues: [{ n: 40, at: "/tabs/2/issues/40", title: "Refresh" }] },
    "/tabs/2/issues/40": { n: 40, title: "Refresh", about: "the shell whole in the first frame" },
  },
}

// The page's globals as a browser gives them at /tabs/2/issues/40, before the shell's module reads its island.
Object.assign(globalThis, {
  location: { pathname: "/tabs/2/issues/40", origin: "http://127.0.0.1:1" },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  document: { getElementById: (id: string) => (id === BOOT_ID ? { textContent: JSON.stringify(served) } : null), querySelector: () => null },
})

const { useLive } = await import("../../framework/shell/ui/tab.tsx")
const { Shell } = await import("../../framework/shell/ui/shell.tsx")

function Queue() {
  const { view: root } = useLive<{ issues: { n: number; title: string }[] }>("/")
  const { view: issue } = useLive<{ about: string }>("/issues/40")

  return (
    <p data-page>
      {root?.issues.length ? `${root.issues.length} issues` : "No issues"}: {issue?.about}
    </p>
  )
}
const Notes = () => <p data-page>notes</p>

describe("a refresh's first frame", () => {
  it("is the shell whole on the tab at the address, with that tab's page drawn from what the page was served", () => {
    const html = renderToString(<Shell surfaces={{ queue: { default: Queue }, notes: { default: Notes } }} />)
    const tabs = [...html.matchAll(/role="tab"[^>]*aria-selected="(true|false)"[^>]*aria-label="([^"]*)"/g)].map(([, selected, label]) => `${selected === "true" ? "*" : ""}${label}`)

    // By default the rail stands at the left, from the bottom: the oldest tab at the head, the newest above the mark at the foot.
    expect(tabs).toEqual(["Notes. Needs you: to decide", "*Queue", expect.stringMatching(/^Home\. The agent is working/)])
    expect(html).toContain('data-turn="working"')
    expect(html).toContain("1 issues<!-- -->: <!-- -->the shell whole in the first frame")
    expect(html).not.toContain("No issues")
    expect(html).not.toContain("onnecting")
    // A tab not yet shown reads and draws nothing.
    expect(html).not.toContain(">notes<")
  })
})
