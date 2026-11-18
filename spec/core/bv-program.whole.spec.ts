// The standalone client and root door, exercised with isolated machine, bin and state directories: the program door.
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import { ACTOR_HEADER, CALL_HEADER, CALL_ID_HEADER, DEAF_MS, ENDPOINT_FILE, SERVICE_HEADER, shaped, summed, under, VERSION } from "../../framework/core/bv/bv.ts"
import { ACTOR_HEADER as actorHeader, CALL_HEADER as callHeader, CALL_ID_HEADER as callIdHeader, DEAF_MS as deafMs, SERVICE_HEADER as serviceHeader, endpointFile } from "../../framework/core/runtime/service.ts"
import { client, setup, cleanup } from "../support/word.ts"

afterEach(cleanup)

describe("the program door", () => {
  it("names the call's header as the runtime does", () => expect(CALL_ID_HEADER).toBe(callIdHeader))
  it("sums calls up: the same change once, its places together, past ten elided; each refusal with its inputs; what was heard once", () => {
    const calls = Array.from({ length: 12 }, (_, i) => ({ path: `/queue/issues/${i + 3}`, handle: "note", args: { text: "x" }, changed: '+ note: "x"\nnotices:\nheard once' }))

    expect(summed([...calls, { path: "/queue/issues/20", handle: "note", args: { text: "a long note, said in more words than forty" }, refused: "refused: issue 20 is done" }], true)).toBe(
      [
        "12 calls done, 1 refused",
        '/queue/issues/{3,4,5,6,7,8,9,10,…} note ×12: + note: "x"',
        'refused: /queue/issues/20 note text="a long note, said in more words than fo…": issue 20 is done',
        "the refusal ended the program: no call after it was made",
        "notices:",
        "heard once",
      ].join("\n"),
    )
    expect(summed([{ path: "/a", handle: "go", args: {}, changed: "" }, { path: "/b/c", handle: "go", args: {}, changed: "" }])).toBe("2 calls done\n/a /b/c go ×2: nothing changed")
  })
  it("reads a view as data: each action as its handle, its fixed args and its inputs, each input an object that can say more later", () => {
    expect(shaped({ n: 1, rows: [{ done: { kind: "handle", name: "done", args: { n: 1 }, open: { why: "string" }, description: "Mark it done" } }] })).toEqual({
      n: 1,
      rows: [{ done: { handle: "done", args: { n: 1 }, inputs: { why: { type: "string" } } } }],
    })
  })
  it("takes a relative path under the path given before -e", () => {
    expect([under("/queue", "issues/3"), under("/queue", "/notes"), under("/queue/issues", "../lanes"), under("/queue"), under("/", "./a/")]).toEqual([
      "/queue/issues/3",
      "/notes",
      "/queue/lanes",
      "/queue",
      "/a",
    ])
  })
  it("runs a program on standard input, under the path before -e, and answers what it printed, then one summary of its calls", () => {
    const s = setup()

    s.open()

    const program = `
      for (const text of ["a", "b", "c"]) await call("/", "add", { text })
      const view: { notes: { at: string; remind: { handle: string; args: object; inputs: object } }[] } = await read("notes")
      print(view.notes.length, view.notes[0].remind)
      for (const note of view.notes) await call(note.at, note.remind.handle, { seconds: 60 })
      // One fact of a view by its path, as the command's own read gives it: its value alone.
      const fact = (await read("/notes/notes")) as unknown[]
      print("fact", fact.length)
    `
    const answer = s.run(["/", "-e", "-"], client, program)

    expect(answer.status, answer.err).toBe(0)
    expect(answer.out).toContain('3 {"handle":"remind","args":{"n":1},"inputs":{"seconds":{"type":"number"}}}\nfact 3\n6 calls done\n')
    expect(answer.out).toMatch(/\n\/notes\/\{1,2,3\} remind ×3: .*due/)
    expect(answer.out).not.toContain("refused")
  })
  it("ends the program at a refusal: the calls before it stay done, and the summary says what was not", () => {
    const s = setup()

    s.open()

    const answer = s.run(["-e", "-"], client, 'await call("/", "add", { text: "a" })\nawait call("/", "add", { text: "" })\nawait call("/", "add", { text: "b" })')

    expect(answer.status).toBe(1)
    expect(answer.out).toContain('1 call done, 1 refused\n')
    expect(answer.out).toContain('refused: / add text="": A note needs text\nthe refusal ended the program: no call after it was made')
    expect(s.run(["/"]).out).toContain("notes.count: 1")
  })
  it("goes on past a refusal the program catches", () => {
    const s = setup()

    s.open()

    const answer = s.run(["-e", "-"], client, 'for (const text of ["a", "", "b"]) await call("/", "add", { text }).catch((e) => print(e.message))')

    expect(answer.status).toBe(0)
    expect(answer.out).toStartWith("refused: / add: A note needs text\n2 calls done, 1 refused\n")
    expect(answer.out).not.toContain("ended the program")
  })
  it("refuses a program that came as more than one word, saying why, and runs one that came as one", () => {
    const s = setup()

    s.open()

    const split = s.run(["-e", 'await call("/", "add", { text: "it', 's" })'])

    expect(split.status).toBe(2)
    expect(split.err).toContain("the program came as 2 words, not one: a quote inside it ended the shell's. Give it on standard input: demo -e - <<'EOF'")
    expect(s.run(["-e", 'await call("/", "add", { text: "one" })']).out).toBe("1 call done\n/ add: notes.count: 0 → 1; latest: null → \"one\"; + action clear\n")
    expect(s.run(["/", "add", "-e", "-"]).err).toContain("-e follows a path alone: demo / -e - <<'EOF' with the program")
    expect(s.run(["-e", `await call("/", "add", { text: "its })`]).err).toContain("a quote inside it may have ended the shell's")
  })
})
it("opens with the page and the command, and of the command's words only what the skill does not say; no pointer to a fuller guide", () => {
  const out = setup().open().out

  expect(out).toMatch(/^page: http:\/\/127\.0\.0\.1:\d+  a new address\ncommand: demo; demo wait \[SECONDS\] waits for the person, then tells what changed\n/)
  expect(out).not.toContain("help")
})
it("door installs bv", () => {
  const s = setup()

  // Put in place without a word of it: the answer names the command to call.
  expect(s.open().out).not.toContain("is now a command")
  expect(statSync(join(s.bin, "bv")).mode & 0o111).toBeTruthy()
})
it("installed bv runs as an extensionless command", () => {
  const s = setup()

  s.open()

  const result = spawnSync(join(s.bin, "bv"), ["/"], { env: s.env, encoding: "utf8" })

  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain("notes.count: 0")
})
it("door replaces an older bv", () => {
  const s = setup()

  writeFileSync(join(s.bin, "bv"), "export const VERSION = 0")
  s.open()
  expect(readFileSync(join(s.bin, "bv"), "utf8")).toContain(`export const VERSION = ${VERSION}`)
})
it("door leaves a current bv", () => {
  const s = setup()
  const text = `export const VERSION = ${VERSION}\n// preserved`

  writeFileSync(join(s.bin, "bv"), text)
  s.open()
  expect(readFileSync(join(s.bin, "bv"), "utf8")).toBe(text)
})
it("door works when bin cannot be written", () => {
  const s = setup()

  s.env.BABAVOSS_BIN = join(s.root, "missing/bin")

  const answer = s.open()

  expect(answer.status, answer.err).toBe(0)
  expect(answer.out).toContain("cannot put bv beside bun")
  expect(answer.out).toContain("allow writing there (under a sandbox, in the harness settings)")
  expect(answer.out).toContain(`command: bun '${s.entry}'`)
})
it("door takes a request", () => {
  const s = setup()

  expect(s.run(["/", "add", "text=door"], s.entry).status).toBe(0)
  expect(s.run(["/notes"]).out).toContain("door")
})
it("duplicates the framework's constants exactly", () => {
  expect(SERVICE_HEADER).toBe(serviceHeader)
  expect(ACTOR_HEADER).toBe(actorHeader)
  expect(CALL_HEADER).toBe(callHeader)
  expect(DEAF_MS).toBe(deafMs)
  expect(endpointFile("state")).toBe(join("state", ENDPOINT_FILE))
})
