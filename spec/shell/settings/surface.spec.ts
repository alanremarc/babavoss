// The settings, the surface that comes with the shell: what the agent and the person see of the person's settings, how
// each is changed, what is refused and why, and that the tab follows the file rather than what it kept.
import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { run, story, type Saved } from "../../../framework/core/index.ts"
import { DEFAULTS } from "../../../framework/shell/settings/src/settings.ts"
import { readSettings, writeSettings } from "../../../framework/shell/settings/src/store.ts"
import { settings, type Command, type Model } from "../../../framework/shell/settings/src/surface.ts"
import { OWN, shell } from "../../../framework/shell/src/surface.ts"
import { poll } from "../../support/poll.ts"

const watching = (c: Command) => c.kind === "watch"
const writing = (c: Command) => c.kind === "write"

describe("the settings", () => {
  it("say at / the appearance with where the rail stands, the preferences, the shortcuts and the mark, small, with the place that holds the shortcuts", () => {
    const { agent } = story(settings(() => "unused"))

    expect(agent.sees()).toEqual({
      title: "Settings",
      how: expect.any(String),
      appearance: { mode: "system", same: true, theme: "neutral", rail: { side: "left", from: "bottom", drawer: "left" } },
      preferences: { motion: "system", scale: 1, side: "right" },
      shortcuts: { at: "/shortcuts", drawer: "mod+p", next: "mod+k", previous: "mod+j" },
      logo: { animate: true },
      archive: { at: "/archive", days: 30, megabytes: 200 },
      mode: expect.anything(),
      theme: expect.anything(),
      dynamic: expect.anything(),
      same: expect.anything(),
      rail: expect.anything(),
      motion: expect.anything(),
      scale: expect.anything(),
      side: expect.anything(),
      animate: expect.anything(),
    })
    expect(agent.offered()).toEqual(["mode", "theme", "dynamic", "same", "rail", "motion", "scale", "side", "animate"])
    expect(agent.offered("/shortcuts")).toEqual(["bind", "reset"])
    expect(agent.sees("/shortcuts")).toMatchObject({ commands: [{ command: "drawer", keys: "mod+p", does: expect.any(String) }, {}, {}] })
  })

  it("are the page's own: a change of one, or of the file, is quiet, told to the agent in no way", async () => {
    const dir = mkdtempSync(join(tmpdir(), "settings-quiet-"))
    const running = run(settings(() => join(dir, "settings.json")), { load: () => undefined, save: () => {} })

    try {
      expect(await running.call("/", "mode", { mode: "dark" }, "person")).toMatchObject({ outcome: "written" })
      expect(running.cause()).toMatchObject({ actor: "person", quiet: true })
      expect(await running.call("/", "rail", { side: "right", from: "top", drawer: "left" }, "person")).toMatchObject({ outcome: "written" })
      expect(running.cause()).toMatchObject({ quiet: true })
      expect(await running.call("/shortcuts", "reset", { command: "all" }, "person")).toMatchObject({ outcome: "written" })
      expect(running.cause()).toMatchObject({ quiet: true })
    } finally {
      await running.stop()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("change the mode, the theme of both modes and the mark's animation, each written to the file", async () => {
    const { agent, world } = story(settings(() => "unused"))

    expect(await agent.call("/", "mode", { mode: "dark" })).toMatchObject({ outcome: "written" })
    expect(await agent.call("/", "theme", { mode: "both", theme: "clay" })).toMatchObject({ outcome: "written" })
    expect(await agent.call("/", "animate", { on: false })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ appearance: { mode: "dark", same: true, theme: "clay" }, logo: { animate: false } })
    expect(world.commands().filter(writing).at(-1)).toEqual({
      kind: "write",
      settings: {
        appearance: { ...DEFAULTS.appearance, mode: "dark", same: true, themes: { light: "clay", dark: "neutral" } },
        preferences: DEFAULTS.preferences,
        keys: {},
        logo: { animate: false },
        archive: DEFAULTS.archive,
      },
    })
    expect(agent.noticed()).toEqual([])
  })

  it("set each preference by the action of its name, to one of its choices, and refuse any other", async () => {
    const { agent, world } = story(settings(() => "unused"))

    expect(await agent.call("/", "motion", { motion: "reduced" })).toMatchObject({ outcome: "written" })
    expect(await agent.call("/", "scale", { scale: 1.25 })).toMatchObject({ outcome: "written" })
    expect(await agent.call("/", "side", { side: "left" })).toMatchObject({ outcome: "written" })
    expect(await agent.call("/", "scale", { scale: 7 })).toMatchObject({ outcome: "refused", reason: "scale: scale must be one of 0.9, 1, 1.1, 1.25, 1.5, not 7" })
    expect(await agent.call("/", "side", { side: "top" })).toMatchObject({ outcome: "refused" })
    expect(agent.sees()).toMatchObject({ preferences: { motion: "reduced", scale: 1.25, side: "left" } })
    expect(world.commands().filter(writing).at(-1)).toMatchObject({ settings: { preferences: { motion: "reduced", scale: 1.25, side: "left" } } })
    expect(agent.noticed()).toEqual([])
  })

  it("give a mode a dynamic theme: by its numbers, or by starting from the theme it replaces", async () => {
    const { agent } = story(settings(() => "unused"))

    await agent.call("/", "theme", { mode: "both", theme: "moss" })
    expect(await agent.call("/", "theme", { mode: "both", theme: "dynamic" })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ appearance: { same: true, theme: { theme: "dynamic", hue: 145, tint: 28, vivid: 50 } } })
    expect(await agent.call("/", "dynamic", { mode: "both", hue: 300, tint: 80, vivid: 10 })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ appearance: { theme: { theme: "dynamic", hue: 300, tint: 80, vivid: 10 } } })
  })

  it("make the modes distinct, each starting from the theme they shared, and the same again", async () => {
    const { agent } = story(settings(() => "unused"))

    await agent.call("/", "dynamic", { mode: "both", hue: 300, tint: 80, vivid: 10 })
    expect(await agent.call("/", "same", { on: false })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({
      appearance: { same: false, light: { theme: "dynamic", hue: 300 }, dark: { theme: "dynamic", hue: 300 } },
    })
    expect(await agent.call("/", "theme", { mode: "dark", theme: "plum" })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ appearance: { same: false, light: { hue: 300 }, dark: "plum" } })
    expect(await agent.call("/", "same", { on: true })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ appearance: { same: true, theme: { hue: 300 } } })
  })

  it("refuse a mode, a theme or numbers there are none of, and a mode that does not fit the modes being the same or distinct, saying why", async () => {
    const { agent } = story(settings(() => "unused"))

    expect(await agent.call("/", "mode", { mode: "dim" })).toEqual({ outcome: "refused", reason: 'mode: mode must be one of light, dark, system, not "dim"' })
    expect(await agent.call("/", "theme", { mode: "both", theme: "sepia" })).toEqual({
      outcome: "refused",
      reason: 'theme: theme must be one of neutral, clay, slate, sand, moss, ocean, plum, dynamic, not "sepia"',
    })
    expect(await agent.call("/", "theme", { mode: "dark", theme: "clay" })).toEqual({
      outcome: "refused",
      reason: "both modes use one theme: name both, or call same with on false first to give dark its own",
    })
    expect(await agent.call("/", "dynamic", { mode: "both", hue: 361, tint: 0, vivid: 0 })).toEqual({ outcome: "refused", reason: "dynamic: hue must be a whole number from 0 to 360, not 361" })
    expect(await agent.call("/", "dynamic", { mode: "both", hue: 0, tint: 101, vivid: 0 })).toEqual({ outcome: "refused", reason: "dynamic: tint must be a whole number from 0 to 100, not 101" })
    expect(await agent.call("/", "dynamic", { mode: "both", hue: 0, tint: 0, vivid: -1 })).toEqual({ outcome: "refused", reason: "dynamic: vivid must be a whole number from 0 to 100, not -1" })
    await agent.call("/", "same", { on: false })
    expect(await agent.call("/", "theme", { mode: "both", theme: "clay" })).toEqual({
      outcome: "refused",
      reason: "the modes have themes of their own: name light or dark, or call same with on true first",
    })
    expect(await agent.call("/", "theme", { mode: "dim", theme: "clay" })).toMatchObject({ outcome: "refused", reason: 'theme: mode must be one of both, light, dark, not "dim"' })
  })

  it("place the rail by one action, all three of its parts given, written to the file, and refuse a part it has not", async () => {
    const { agent, world } = story(settings(() => "unused"))

    expect(await agent.call("/", "rail", { side: "top", from: "bottom", drawer: "right" })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ appearance: { rail: { side: "top", from: "bottom", drawer: "right" } } })
    expect(world.commands().filter(writing).at(-1)).toMatchObject({ settings: { appearance: { rail: { side: "top", from: "bottom", drawer: "right" } } } })
    expect(await agent.call("/", "rail", { side: "middle", from: "top", drawer: "left" })).toEqual({ outcome: "refused", reason: 'rail: side must be one of left, right, top, bottom, not "middle"' })
    expect(await agent.call("/", "rail", { side: "left", from: "left", drawer: "left" })).toEqual({ outcome: "refused", reason: 'rail: from must be one of top, bottom, not "left"' })
    expect(await agent.call("/", "rail", { side: "left", from: "top", drawer: "top" })).toEqual({ outcome: "refused", reason: 'rail: drawer must be one of left, right, not "top"' })
    expect(agent.noticed()).toEqual([])
  })

  it("bind a command to keys, and refuse keys another command has, saying which, and keys that cannot be a binding", async () => {
    const { agent, person } = story(settings(() => "unused"))

    expect(await person.call("/shortcuts", "bind", { command: "drawer", keys: "mod+shift+h" })).toMatchObject({ outcome: "written" })
    expect((agent.sees("/shortcuts")!.commands as unknown[])[0]).toEqual({ command: "drawer", does: expect.any(String), keys: "mod+shift+h", default: "mod+p" })
    expect(agent.sees()).toMatchObject({ shortcuts: { drawer: "mod+shift+h" } })
    expect(await agent.call("/shortcuts", "bind", { command: "drawer", keys: "mod+k" })).toEqual({
      outcome: "refused",
      reason: "mod+k is bound to next already: bind next to other keys first, or choose others",
    })
    expect(await agent.call("/shortcuts", "bind", { command: "drawer", keys: "h" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("types text") })
    expect(await agent.call("/shortcuts", "bind", { command: "jump", keys: "mod+x" })).toMatchObject({ outcome: "refused", reason: 'bind: command must be one of drawer, next, previous, not "jump"' })
  })

  it("reset one command, or all, to the defaults, unless a default is taken meanwhile", async () => {
    const { agent } = story(settings(() => "unused"))

    await agent.call("/shortcuts", "bind", { command: "drawer", keys: "mod+h" })
    await agent.call("/shortcuts", "bind", { command: "next", keys: "mod+p" })
    expect(await agent.call("/shortcuts", "reset", { command: "drawer" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("bound to next now") })
    expect(await agent.call("/shortcuts", "reset", { command: "all" })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ shortcuts: { drawer: "mod+p", next: "mod+k" } })
  })

  it("follow the file: what it says when read is what the tab says, but never over a change of the tab's own not yet written", async () => {
    const { agent, world } = story(settings(() => "unused"))
    const elsewhere = { ...DEFAULTS, logo: { animate: false } }

    await world.send(watching, { kind: "read", settings: elsewhere })
    expect(agent.sees()).toMatchObject({ logo: { animate: false } })
    await agent.call("/", "mode", { mode: "light" })
    await world.send(watching, { kind: "read", settings: elsewhere })
    expect(agent.sees()).toMatchObject({ appearance: { mode: "light" } })
    await world.settle(writing, { kind: "wrote" })
    await world.send(watching, { kind: "read", settings: { ...elsewhere, appearance: { ...elsewhere.appearance, mode: "light" } } })
    expect(agent.sees()).toMatchObject({ appearance: { mode: "light" }, logo: { animate: false } })
  })

  it("say when a change could not be saved", async () => {
    const { agent, world } = story(settings(() => "unused"))

    await agent.call("/", "animate", { on: false })
    await world.fail(writing, "EACCES")
    expect(agent.noticed()).toEqual(["highlight: The settings were not saved: EACCES"])
    expect(agent.sees()).toMatchObject({ unsaved: "EACCES" })
  })

  it("are the file's for real: a tab writes it and another follows it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "babavoss-settings-"))
    const file = join(dir, "settings.json")
    const memory = () => {
      let kept: Saved | undefined

      return { load: () => kept, save: (saved: Saved) => void (kept = saved) }
    }
    const one = run(settings(() => file), memory())
    const two = run(settings(() => file), memory())

    // A watch's events come late on a busy machine: each wait is for the condition, with the time it may take.
    const late = { timeout: 20_000 }
    const logo = (r: { read: (path: string) => unknown }) => (r.read("/") as { logo: { animate: boolean } }).logo.animate

    try {
      // A watch may miss what is written as it starts: the file is written again until both tabs follow it.
      for (let tries = 0; logo(one) || logo(two); tries++) {
        if (tries === 20) throw new Error("the tabs never followed the file")
        writeSettings(file, { ...readSettings(file), logo: { animate: false } })
        await poll(() => !logo(one) && !logo(two), { timeout: 1000 }).toBe(true).catch(() => {})
      }
      await one.call("/shortcuts", "bind", { command: "next", keys: "alt+n" }, "person")
      await poll(() => readSettings(file).keys.next, late).toBe("alt+n")
      await poll(() => (two.read("/shortcuts") as { commands: { keys: string }[] }).commands[1]!.keys, late).toBe("alt+n")
      // Its own write done, the tab follows the file again, and not before.
      await poll(() => (one.model() as Model).writing, late).toBe(0)
      writeSettings(file, { ...readSettings(file), logo: { animate: true } })
      await poll(() => logo(one), late).toBe(true)
    } finally {
      await one.stop()
      await two.stop()
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe("the shell's settings", () => {
  it("come with the shell, after the project's surfaces, and one tab of them is enough: opening again shows it", async () => {
    const { agent } = story(shell({}, "/project/.baba", {}, { settings: settings(() => "unused") }))

    expect(Object.keys(OWN)).toEqual(["settings"])
    expect((agent.sees()!.surfaces as { name: string; open: { description: string } }[])[0]).toMatchObject({
      name: "settings",
      open: { name: "open", args: { surface: "settings" } },
    })
    await agent.call("/", "open", { surface: "settings" })
    expect(await agent.call("/", "open", { surface: "settings" })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ tabs: [{ at: "/settings", surface: "settings", title: "Settings" }], pointed: { at: "/settings", n: 1 } })
  })

  it("take the name settings from a project's surface", () => {
    const { agent } = story(shell({ settings: settings(() => "theirs") }, "/project/.baba", {}, { settings: settings(() => "unused") }))

    expect((agent.sees()!.surfaces as unknown[]).length).toBe(1)
  })
})

describe("the archive of closed tabs in the settings", () => {
  const measured = { session: { tabs: 2, sessions: 0, bytes: 12_000 }, project: { tabs: 5, sessions: 1, bytes: 3_400_000, running: 1 } }

  it("says at /archive its window, the person's in every project, what each clear would free, and the project it acts on", async () => {
    const { agent, world } = story(settings(() => "unused", () => "/work/app/.babavoss/sessions/S"))

    expect(world.commands()).toContainEqual({ kind: "measure" })
    await world.settle((c: Command) => c.kind === "measure", { kind: "measured", measure: measured })
    expect(agent.sees("/archive")).toMatchObject({
      title: "Closed tabs",
      project: "/work/app",
      window: { days: 30, megabytes: 200 },
      session: { tabs: 2, size: "12.0 KB" },
      wholeProject: { tabs: 5, sessions: 1, size: "3.4 MB", running: "1 other session runs now, and is left as it is" },
    })
    expect(agent.offered("/archive")).toEqual(["keep", "measure", "clear", "clear"])

    const view = agent.sees("/archive") as Record<string, { description: string }>

    expect(view.clearSession!.description).toBe("frees 2 closed tabs, 12.0 KB")
    expect(view.clearProject!.description).toBe("frees 5 closed tabs and 1 session over, 3.4 MB, of /work/app")
  })

  it("clears when called, offering no second clear meanwhile, and says what it freed", async () => {
    const { agent, world } = story(settings(() => "unused", () => "/work/app/.babavoss/sessions/S"))

    await world.settle((c: Command) => c.kind === "measure", { kind: "measured", measure: measured })
    expect(await agent.call("/archive", "clear", { scope: "session" })).toMatchObject({ outcome: "written" })
    expect(world.commands().at(-1)).toEqual({ kind: "clear", scope: "session", window: { days: 30, megabytes: 200 } })
    expect(agent.sees("/archive")).toMatchObject({ clearing: "session" })
    expect(agent.offered("/archive")).toEqual(["keep", "measure"])
    await world.settle((c: Command) => c.kind === "clear", { kind: "cleared", scope: "session", freed: { tabs: 2, sessions: 0, bytes: 12_000 } })
    expect(agent.noticed()).toEqual(["Cleared 2 closed tabs, 12.0 KB, from this session's archive"])
    expect(world.commands().at(-1)).toEqual({ kind: "measure" })
  })

  it("keeps the window the person sets, within its bounds, written to their file", async () => {
    const { agent, world } = story(settings(() => "unused", () => undefined))

    expect(await agent.call("/archive", "keep", { days: 0, megabytes: 200 })).toEqual({ outcome: "refused", reason: "keep: days must be a whole number from 1 to 3650, not 0" })
    expect(await agent.call("/archive", "keep", { days: 7, megabytes: 50 })).toMatchObject({ outcome: "written" })
    expect(world.commands().filter(writing).at(-1)).toMatchObject({ settings: { archive: { days: 7, megabytes: 50 } } })
    expect(agent.sees("/archive")).toMatchObject({ project: "none: this tab runs in no session", window: { days: 7, megabytes: 50 } })
    expect(agent.offered("/archive")).toEqual(["keep"])
  })
})
