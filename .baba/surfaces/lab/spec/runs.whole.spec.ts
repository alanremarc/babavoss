// A run's project: a copy of a checkout as it is now, against a git repository made for the spec. What is uncommitted comes
// along, staged or not, added or deleted; what git ignores, what sessions write and the lab itself stay out; and the copy
// is a repository of its own, so what the agent under test commits there never reaches the checkout. A run's directory,
// once closed, keeps its record alone, and what deletes there never reaches outside it.
import { afterAll, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { checkoutOf, copyCheckout, REPO, runDir, runsAt } from "../src/runs.ts"

const made: string[] = []
const temp = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lab-runs-spec-")))

  made.push(dir)

  return dir
}
/** Git in `cwd`; the fixture's commits are the spec's, where no identity is configured. */
const git = (cwd: string, ...args: string[]) => {
  const own = Bun.spawnSync(["git", "config", "user.name"], { cwd, stdout: "pipe" }).exitCode === 0
  const as = own ? [] : ["-c", "user.name=spec", "-c", "user.email=spec@example.invalid"]
  const done = Bun.spawnSync(["git", ...as, ...args], { cwd, stdout: "pipe", stderr: "pipe" })

  if (done.exitCode !== 0) throw new Error(done.stderr.toString())

  return done.stdout.toString().trimEnd()
}
const put = (dir: string, path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}

afterAll(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/** A checkout with a commit, and over it every kind of change there is. */
function checkout() {
  const dir = temp()

  git(dir, "init", "-q")
  put(dir, ".gitignore", "node_modules\n")
  put(dir, ".baba/package.json", "{}\n")
  put(dir, ".baba/surfaces/lab/src/surface.ts", "// the lab\n")
  put(dir, ".baba/surfaces/queue/src/surface.ts", "// the queue\n")
  put(dir, "kept.ts", "committed\n")
  put(dir, "changed.ts", "committed\n")
  put(dir, "staged.ts", "committed\n")
  put(dir, "gone.ts", "committed\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "first")
  put(dir, "changed.ts", "changed, not staged\n")
  put(dir, "staged.ts", "changed and staged\n")
  git(dir, "add", "staged.ts")
  rmSync(join(dir, "gone.ts"))
  put(dir, "new/added.ts", "untracked\n")
  put(dir, "node_modules/dep/index.js", "ignored\n")
  put(dir, ".baba/.state/sessions/s/baba/model.json", "{}\n")
  put(dir, ".baba/surfaces/lab/src/new.ts", "the lab's, uncommitted\n")
  mkdirSync(join(dir, "nested"))
  git(join(dir, "nested"), "init", "-q")
  put(dir, "nested/inner.ts", "a repository of its own\n")

  return dir
}

test("the copy is the checkout as it is now: its commit, and each path that differs from it", () => {
  const from = checkout()
  const project = join(temp(), "project")
  const copied = copyCheckout(from, project)
  const read = (path: string) => readFileSync(join(project, path), "utf8")

  expect(copied).toEqual({ from, commit: git(from, "rev-parse", "HEAD"), dirty: ["changed.ts", "gone.ts", "new/added.ts", "staged.ts"] })
  expect([read("kept.ts"), read("changed.ts"), read("staged.ts"), read("new/added.ts")]).toEqual([
    "committed\n",
    "changed, not staged\n",
    "changed and staged\n",
    "untracked\n",
  ])
  expect(existsSync(join(project, "gone.ts"))).toBe(false)
  expect(read(".baba/surfaces/queue/src/surface.ts")).toBe("// the queue\n")
  expect(["node_modules", ".baba/.state", "nested", ".baba/surfaces/lab"].filter((path) => existsSync(join(project, path)))).toEqual([])
  // The lab is left out without the copy's git calling it deleted.
  expect(git(project, "status", "--short").split("\n").sort()).toEqual([" D gone.ts", " M changed.ts", " M staged.ts", "?? new/"])
})

test("the copy is a repository of its own: no remote, its own refs, and a commit there never reaches the checkout", () => {
  const from = checkout()
  const project = join(temp(), "project")
  const before = git(from, "for-each-ref")

  copyCheckout(from, project)
  expect(git(project, "remote")).toBe("")
  git(project, "add", "-A")
  git(project, "commit", "-q", "-m", "by the agent under test")
  expect(git(project, "log", "-1", "--format=%an")).toBe("the agent under test")
  expect(git(from, "for-each-ref")).toBe(before)
  expect(git(from, "status", "--short")).toContain(" M changed.ts")
})

test("a run starts from the top of a git checkout with a .baba/, this repository by default", () => {
  const from = checkout()
  const bare = temp()

  expect(checkoutOf("")).toBe(REPO)
  expect(checkoutOf(from)).toBe(from)
  expect(() => checkoutOf(join(from, "new"))).toThrow("is not the top of a git checkout")
  expect(() => checkoutOf(bare)).toThrow("is not the top of a git checkout")
  git(bare, "init", "-q")
  expect(() => checkoutOf(bare)).toThrow("has no .baba/")
  expect(() => checkoutOf(join(bare, "missing"))).toThrow("does not exist")
})

/** A directory of runs, each with a record, a project and a home whose login is a link to a keychain outside. */
function runsDir(...ids: string[]) {
  const root = temp()
  const keychain = join(temp(), "Keychains")

  put(keychain, "login.keychain-db", "the person's")
  for (const id of ids) {
    put(root, `${id}/run.json`, `${JSON.stringify({ id, status: "idle" })}\n`)
    put(root, `${id}/project/notes.md`, "the agent's work\n")
    put(root, `${id}/home/.claude/projects/p/t.jsonl`, "a transcript\n")
    mkdirSync(join(root, id, "home/Library"), { recursive: true })
    symlinkSync(keychain, join(root, id, "home/Library/Keychains"))
  }

  return { root, keychain, place: runsAt(root) }
}

test("a run's name is one name right under the runs, never a path out of them", () => {
  const root = temp()

  expect(runDir("2026-11-15T10-00-00-ab12", root)).toBe(join(root, "2026-11-15T10-00-00-ab12"))
  expect(["..", ".", "../x", "a/b", "", "/etc"].map((id) => runDir(id, root))).toEqual(Array(6).fill(undefined))
})

test("a closed run's project and home are deleted, the keychain's link removed and never followed; its record stays", () => {
  const { root, keychain, place } = runsDir("r1")

  place.clear(join(root, "r1"))
  expect(["project", "home"].filter((held) => existsSync(join(root, "r1", held)))).toEqual([])
  expect(place.list()).toEqual([{ id: "r1", status: "idle" }])
  expect(readFileSync(join(keychain, "login.keychain-db"), "utf8")).toBe("the person's")
  place.clear(join(root, ".."))
  place.clear(keychain)
  expect(existsSync(keychain)).toBe(true)
})

test("a forgotten run is deleted whole, and nothing outside the runs is", () => {
  const { root, keychain, place } = runsDir("r1", "r2")

  place.forget("r1")
  place.forget("..")
  expect(place.list()).toEqual([{ id: "r2", status: "idle" }])
  expect(existsSync(root)).toBe(true)
  expect(existsSync(join(keychain, "login.keychain-db"))).toBe(true)
})

test("a sweep clears every run that is not spared, its home's login taken back first, and keeps their records", async () => {
  const { root, keychain, place } = runsDir("r1", "r2", "r3")
  const released: string[] = []

  place.clear(join(root, "r3"))
  expect(await place.sweep((id) => id === "r2", (home) => void released.push(home))).toEqual(["r1"])
  expect(released).toEqual([join(root, "r1/home")])
  expect(existsSync(join(root, "r1/home"))).toBe(false)
  expect(existsSync(join(root, "r2/project/notes.md"))).toBe(true)
  expect(place.list()).toHaveLength(3)
  expect(existsSync(join(keychain, "login.keychain-db"))).toBe(true)
})
