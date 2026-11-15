// The settings, the surface that comes with the shell: what the agent and the person see of the person's settings, how
// each is changed, what is refused and why, and that the tab follows the file rather than what it kept.
import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { run, story, type Saved } from "../../../framework/core/index.ts"
import { DEFAULTS } from "../../../framework/shell/settings/src/settings.ts"
import { readSettings, writeSettings } from "../../../framework/shell/settings/src/store.ts"
import { settings, type Command } from "../../../framework/shell/settings/src/surface.ts"
import { OWN, shell } from "../../../framework/shell/src/surface.ts"
import { poll } from "../../support/poll.ts"

const watching = (c: Command) => c.kind === "watch"
const writing = (c: Command) => c.kind === "write"

describe("the settings", () => {
  it("say at / the appearance, the shortcuts and the mark, small, with the place that holds the shortcuts", () => {
    const { agent } = story(settings(() => "unused"))

    expect(agent.sees()).toEqual({
      title: "Settings",
      how: expect.any(String),
      appearance: { mode: "system", light: "neutral", dark: "neutral" },
      shortcuts: { at: "/shortcuts", home: "mod+p", next: "mod+j", previous: "mod+k", menu: "shift+f10" },
      logo: { animate: true },
      mode: expect.anything(),
      theme: expect.anything(),
      animate: expect.anything(),
    })
    expect(agent.offered()).toEqual(["mode", "theme", "animate"])
    expect(agent.offered("/shortcuts")).toEqual(["bind", "reset"])
    expect(agent.sees("/shortcuts")).toMatchObject({ commands: [{ command: "home", keys: "mod+p", does: expect.any(String) }, {}, {}, {}] })
  })

  it("are the page's own: a change of one, or of the file, is quiet, told to the agent in no way", async () => {
    const dir = mkdtempSync(join(tmpdir(), "settings-quiet-"))
    const running = run(settings(() => join(dir, "settings.json")), { load: () => undefined, save: () => {} })

    try {
      expect(await running.call("/", "mode", { mode: "dark" }, "person")).toMatchObject({ outcome: "written" })
      expect(running.cause()).toMatchObject({ actor: "person", quiet: true })
      expect(await running.call("/shortcuts", "reset", { command: "all" }, "person")).toMatchObject({ outcome: "written" })
      expect(running.cause()).toMatchObject({ quiet: true })
    } finally {
      await running.stop()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("change the mode, a theme and the mark's animation, each written to the file", async () => {
    const { agent, world } = story(settings(() => "unused"))

    expect(await agent.call("/", "mode", { mode: "dark" })).toMatchObject({ outcome: "written" })
    expect(await agent.call("/", "theme", { mode: "dark", theme: "claude" })).toMatchObject({ outcome: "written" })
    expect(await agent.call("/", "animate", { on: false })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ appearance: { mode: "dark", dark: "claude" }, logo: { animate: false } })
    expect(world.commands().filter(writing).at(-1)).toEqual({
      kind: "write",
      settings: { appearance: { mode: "dark", themes: { light: "neutral", dark: "claude" } }, keys: {}, logo: { animate: false } },
    })
    expect(agent.noticed()).toEqual([])
  })

  it("refuse a mode or a theme there is none of, saying which there are", async () => {
    const { agent } = story(settings(() => "unused"))

    expect(await agent.call("/", "mode", { mode: "dim" })).toEqual({ outcome: "refused", reason: "no mode dim: it is light, dark, system" })
    expect(await agent.call("/", "theme", { mode: "dark", theme: "sepia" })).toEqual({ outcome: "refused", reason: "no dark theme sepia: it is neutral or claude" })
  })

  it("bind a command to keys, and refuse keys another command has, saying which, and keys that cannot be a binding", async () => {
    const { agent, person } = story(settings(() => "unused"))

    expect(await person.call("/shortcuts", "bind", { command: "home", keys: "mod+shift+h" })).toMatchObject({ outcome: "written" })
    expect((agent.sees("/shortcuts")!.commands as unknown[])[0]).toEqual({ command: "home", does: expect.any(String), keys: "mod+shift+h", default: "mod+p" })
    expect(agent.sees()).toMatchObject({ shortcuts: { home: "mod+shift+h" } })
    expect(await agent.call("/shortcuts", "bind", { command: "home", keys: "mod+j" })).toEqual({
      outcome: "refused",
      reason: "mod+j is bound to next already: bind next to other keys first, or choose others",
    })
    expect(await agent.call("/shortcuts", "bind", { command: "home", keys: "h" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("types text") })
    expect(await agent.call("/shortcuts", "bind", { command: "jump", keys: "mod+x" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("no command jump") })
  })

  it("reset one command, or all, to the defaults, unless a default is taken meanwhile", async () => {
    const { agent } = story(settings(() => "unused"))

    await agent.call("/shortcuts", "bind", { command: "home", keys: "mod+h" })
    await agent.call("/shortcuts", "bind", { command: "next", keys: "mod+p" })
    expect(await agent.call("/shortcuts", "reset", { command: "home" })).toMatchObject({ outcome: "refused", reason: expect.stringContaining("bound to next now") })
    expect(await agent.call("/shortcuts", "reset", { command: "all" })).toMatchObject({ outcome: "written" })
    expect(agent.sees()).toMatchObject({ shortcuts: { home: "mod+p", next: "mod+j" } })
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
    expect(agent.noticed()).toEqual(["The settings were not saved: EACCES"])
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

    try {
      await one.call("/shortcuts", "bind", { command: "next", keys: "alt+n" }, "person")
      await poll(() => readSettings(file).keys.next).toBe("alt+n")
      await poll(() => (two.read("/shortcuts") as { commands: { keys: string }[] }).commands[1]!.keys).toBe("alt+n")
      writeSettings(file, { ...readSettings(file), logo: { animate: false } })
      await poll(() => one.read("/")).toMatchObject({ logo: { animate: false } })
    } finally {
      await one.stop()
      await two.stop()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("the shell's settings", () => {
  it("come with the shell, after the project's surfaces, and one tab of them is enough: opening again shows it", async () => {
    const { agent } = story(shell({}, "/project/.baba", {}, { settings: settings(() => "unused") }))

    expect(Object.keys(OWN)).toEqual(["settings"])
    expect((agent.sees()!.surfaces as { name: string; open: { description: string } }[])[0]).toMatchObject({
      name: "settings",
      open: { description: "open the settings tab, or show the one open" },
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
