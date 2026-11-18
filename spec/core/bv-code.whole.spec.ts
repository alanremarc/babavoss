// The standalone client and root door, exercised with isolated machine, bin and state directories: changed code, in both modes.
import { poll } from "../support/poll.ts"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import { client, setup, cleanup } from "../support/word.ts"

afterEach(cleanup)

describe("changed code", () => {
  const edit = (s: ReturnType<typeof setup>) => {
    const source = join(s.root, "root/src/root.ts")

    writeFileSync(source, readFileSync(source, "utf8").replace('name: "add",\n  description: ""', 'name: "add",\n  description: "as edited"'))
  }

  it("in dev mode restarts the runtime at once: the same address, the notes kept, the new code answering, a reminder under way cut and said", async () => {
    const s = setup(true)

    s.open()
    s.run(["/", "add", "text=Pharmacy"])
    s.run(["/notes/1", "remind", "seconds=60"])

    const before = s.endpoint()

    const answers: string[] = []

    edit(s)
    await poll(() => answers[answers.push(s.run(["/"]).out) - 1], { timeout: 10_000 }).toContain("add text=line   as edited")
    // The first answer from the code as edited says what the restart cut, as the agent may have to do it again.
    expect(answers.at(-1)).toMatch(/^demo: its code changed \(.*root\.ts\) and it restarted; the restart cut remind by agent:S\n/)

    const after = s.endpoint()

    expect([after.port, after.instance === before.instance, after.pid === before.pid]).toEqual([before.port, false, false])
    expect(s.run(["/"]).out).toContain("Pharmacy")
    expect(s.run(["/"]).out).not.toContain("page:")
  })

  it("in normal mode runs the code it started with, says it changed, and runs it once restarted, which answers at once with nothing under way", async () => {
    const s = setup()

    s.open()

    const before = s.endpoint()

    edit(s)
    await poll(() => s.run(["/"]).out, { timeout: 10_000 }).toContain(`code: changed on disk since instance ${before.instance} started; it runs once restarted: demo restart`)
    expect(s.run(["/"]).out).not.toContain("as edited")

    const restarted = s.run(["restart"])

    expect(restarted.out).toBe(`demo: instance ${before.instance} restarts\ndemo: instance ${s.endpoint().instance} answers\n`)
    expect(s.endpoint().port).toBe(before.port)
    expect(s.run(["/"]).out).toContain("add text=line   as edited")
    expect(s.run(["/"]).out).not.toContain("code: changed")
  })

  it("in normal mode drains a restart while work runs: the command exits at once naming the instance, and follow returns once its successor answers", async () => {
    const s = setup()

    s.open()
    s.run(["/", "add", "text=Pharmacy"])
    s.run(["/notes/1", "remind", "seconds=2"])

    const { instance } = s.endpoint()
    const asked = Date.now()
    const draining = s.run(["restart"])

    expect(Date.now() - asked).toBeLessThan(1500)
    expect(draining.out).toBe(
      `demo: instance ${instance} is draining to restart: it takes no new calls and restarts once remind by agent:S ended. Wait for it: demo follow ${instance}\n`,
    )
    expect(s.run(["/", "add", "text=Later"])).toMatchObject({ status: 1, out: expect.stringContaining("refused: demo: instance") })

    const followed = s.run(["follow", instance])

    expect(followed.status).toBe(0)
    expect(followed.out).toMatch(new RegExp(`^demo: instance ${instance} restarted; instance (?!${instance})[0-9a-f]+ answers\n$`))
    expect(Date.now() - asked).toBeGreaterThan(1500)
    expect(s.run(["/"]).out).toContain("due: 1")
    // Gone already: follow says so at once.
    expect(s.run(["follow", instance]).out).toMatch(new RegExp(`^demo: instance ${instance} is gone; instance [0-9a-f]+ answers\n$`))
  }, 20_000)
})
it("an open names the page each time, and calls it new only once", () => {
  const s = setup()

  expect(s.open().out).toContain(`page: http://127.0.0.1:${s.endpoint().port}  a new address\n`)

  const again = s.open().out

  expect(again).toContain(`page: http://127.0.0.1:${s.endpoint().port}\n`)
  expect(again).not.toContain("a new address")
})
it("takes another address where the session's last one is taken, and announces it", async () => {
  const s = setup()

  s.open()

  const port = s.endpoint().port

  s.run(["close"])
  await Bun.sleep(150)

  const squatter = Bun.listen({ hostname: "127.0.0.1", port, socket: { data() {} } })

  try {
    expect(s.run(["/"]).out).toContain("  a new address\n")
    expect(s.endpoint().port).not.toBe(port)
  } finally {
    squatter.stop(true)
  }
})
it("runs a loop of calls", () => {
  const s = setup()

  s.open()
  expect(s.run(["-e", 'for(let i=0;i<3;i++) console.log(await root.call("/","add",{text:String(i)}))']).status).toBe(0)
  expect(s.run(["/"]).out).toContain("notes.count: 3")
})
it("returns a program refusal as data", () => {
  const s = setup()

  s.open()

  const answer = s.run(["-e", 'console.log(await root.call("/","add",{text:""}))'])

  expect(answer.status).toBe(0)
  expect(answer.out).toContain("A note needs text")
})
it("reads program code from stdin", () => {
  const s = setup()

  s.open()
  expect(s.run(["-e", "-"], client, 'console.log(await root.read("/"))').out).toContain("count: 0")
})
it("prints the full help", () => expect(setup().run(["help"]).out).toContain("A refusal ends the program unless it catches it"))
