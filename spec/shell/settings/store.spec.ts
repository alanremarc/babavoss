// Where the person's settings are kept: one file, read tolerantly, written whole with what else it holds, and followed.
import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { adoptHome } from "../../../framework/core/provision.ts"
import { DEFAULTS } from "../../../framework/shell/settings/src/settings.ts"
import { readSettings, settingsFile, watchSettings, writeSettings } from "../../../framework/shell/settings/src/store.ts"
import { poll } from "../../support/poll.ts"

const dirs: string[] = []
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "babavoss-store-"))

  dirs.push(dir)

  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("the settings file", () => {
  it("is the person's, in their home's .baba/, whatever a project's root keeps its sessions in, unless BABAVOSS_SETTINGS names another", () => {
    expect(settingsFile({ BABAVOSS_HOME: "/project/.baba/.state" })).toBe(join(homedir(), ".baba", "settings.json"))
    expect(settingsFile({ BABAVOSS_SETTINGS: "/elsewhere/s.json" })).toBe("/elsewhere/s.json")
    expect(process.env.BABAVOSS_SETTINGS).not.toBe(join(homedir(), ".baba", "settings.json"))
  })

  it("is taken from where an older release kept it, once: never over settings already there, and the old folder goes only when empty", () => {
    const home = mkdtempSync(join(tmpdir(), "home-"))
    const older = join(home, ".babavoss")
    const now = join(home, ".baba/settings.json")

    dirs.push(home)
    adoptHome(home)
    expect(existsSync(join(home, ".baba"))).toBe(false)
    mkdirSync(older)
    writeFileSync(join(older, "settings.json"), '{"mode":"dark"}')
    writeFileSync(join(older, "other.json"), "{}")
    adoptHome(home)
    expect(readFileSync(now, "utf8")).toBe('{"mode":"dark"}')
    // What else is there is not baba's to remove.
    expect(readdirSync(older)).toEqual(["other.json"])
    writeFileSync(join(older, "settings.json"), '{"mode":"light"}')
    adoptHome(home)
    expect(readFileSync(now, "utf8")).toBe('{"mode":"dark"}')
    expect(existsSync(join(older, "settings.json"))).toBe(true)
    rmSync(join(older, "settings.json"))
    rmSync(join(older, "other.json"))
    adoptHome(home)
    expect(existsSync(older)).toBe(false)
  })

  it("is the defaults where it is missing or broken", () => {
    const dir = fresh()

    expect(readSettings(join(dir, "none.json"))).toEqual(DEFAULTS)
    writeFileSync(join(dir, "broken.json"), "{ not json")
    expect(readSettings(join(dir, "broken.json"))).toEqual(DEFAULTS)
  })

  it("is written whole, keeping what else it holds, into a directory made for it", () => {
    const file = join(fresh(), "deep", "settings.json")

    writeSettings(file, DEFAULTS)
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), later: { kept: true } }))
    writeSettings(file, { ...DEFAULTS, logo: { animate: false } })
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ later: { kept: true }, logo: { animate: false } })
    expect(readSettings(file).logo.animate).toBe(false)
  })

  it("is followed: a write to it, made or replaced, is told", async () => {
    const file = join(fresh(), "settings.json")
    let told = 0
    const stop = watchSettings(file, () => told++)

    try {
      // Written until it is told: a watch on a busy machine may not be up for the first write.
      await poll(() => {
        if (!told) writeSettings(file, DEFAULTS)

        return told > 0
      }).toBe(true)
    } finally {
      stop()
    }
  })
})
