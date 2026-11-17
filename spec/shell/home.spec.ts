// Home, the shell's own page and its drawer: the page at / and where no tab is; the desktop's icons, a surface each with its
// tabs and their strongest mark; and home's menu, drawn from the shell's own view at / as a tab's is from its surface's,
// its actions reading as entries, the open tabs as its places.
import { describe, expect, it } from "bun:test"
import { action, story, surface, view, type Update, type View } from "../../framework/core/index.ts"
import type { MenuItem } from "../../framework/kit/layouts/menu.tsx"
import { shell } from "../../framework/shell/src/surface.ts"
import { homeMenu, iconsOf, openOf } from "../../framework/shell/ui/home.ts"
import { HOME, placeOf } from "../../framework/shell/ui/pointing.ts"

const bump = action({ name: "bump", description: "add one", subject: {}, inputs: {}, update: (m: { n: number }): Update<{ n: number }, never> => ({ model: { n: m.n + 1 } }) })
const pages = view([bump], { "/": (m) => ({ title: "Counter", n: m.n, bump: bump.bind({}) }) })
const counter = surface<{ n: number }, never, never>({
  description: "Count things. Use when counting.",
  init: () => ({ n: 0 }),
  update: (m, msg) => pages.update(m, msg as never),
  view: pages.view,
  run: async () => {},
  failed: () => undefined as never,
})
const labels = (items: MenuItem[]): unknown[] =>
  items.map((i) => (i.kind === "submenu" ? { [i.label]: labels(i.items) } : i.kind === "separator" ? "—" : i.kind === "action" ? `${i.label}${i.mark ? " •" : ""}` : i.label))

describe("home", () => {
  it("is the page at /, and where no tab is", () => {
    expect(placeOf("/")).toEqual({ key: HOME, route: "/" })
    expect(placeOf("/tabs")).toEqual({ key: HOME, route: "/" })
  })

  it("is a desktop of a surface each, in the order given, with its open tabs newest first and the strongest mark among them", () => {
    const icons = iconsOf(
      [{ name: "queue" }, { name: "lab" }, { name: "notes" }],
      [
        { at: "/tabs/4", surface: "lab", mark: "highlight" as const },
        { at: "/queue", surface: "queue" },
        { at: "/lab", surface: "lab", mark: "broken" as const },
      ]
    )

    expect(icons.map((i) => [i.surface.name, i.tabs.map((t) => t.at), i.mark])).toEqual([
      ["queue", ["/queue"], undefined],
      ["lab", ["/tabs/4", "/lab"], "broken"],
      ["notes", [], undefined],
    ])
    expect([openOf(0), openOf(1), openOf(2)]).toEqual([undefined, "Open", "2 tabs"])
  })

  it("draws its menu from the shell's view at / as the person reads it: open for each surface, close for each tab, the tabs as places", async () => {
    const { person } = story(shell({ counter }, "/project/.baba"))

    await person.call("/", "open", { surface: "counter" })
    await person.call("/", "open", { surface: "counter" })

    const items = homeMenu({
      view: person.sees("/") as View,
      title: "baba",
      tabs: [
        { at: "/tabs/2", label: "Counter 2" },
        { at: "/counter", label: "Counter", mark: "highlight" },
      ],
      start: () => {},
      navigate: () => {},
    })

    expect(labels(items)).toEqual([
      "Open a counter tab",
      "Open the settings tab, or show the one open",
      "Close tab 1, Counter; its state is dropped",
      "Close tab 2, Counter; its state is dropped",
      "—",
      { Go: ["Counter 2", "Counter •"] },
    ])
  })

  it("runs an entry of its menu as the shell's action, and goes to a tab by its place", async () => {
    const { person } = story(shell({ counter }, "/project/.baba"))
    const started: string[] = []
    const went: string[] = []

    await person.call("/", "open", { surface: "counter" })

    const items = homeMenu({ view: person.sees("/") as View, title: "baba", tabs: [{ at: "/counter", label: "Counter" }], start: (a) => started.push(`${a.handle.name} ${JSON.stringify(a.handle.args)}`), navigate: (at) => went.push(at) })
    const run = (label: string, list: MenuItem[] = items): void => {
      for (const i of list) {
        if (i.kind === "action" && i.label === label) return i.run()
        if (i.kind === "submenu") run(label, i.items)
      }
    }

    run("Open a counter tab")
    run("Counter")
    expect(started).toEqual(['open {"surface":"counter"}'])
    expect(went).toEqual(["/counter"])
  })
})
