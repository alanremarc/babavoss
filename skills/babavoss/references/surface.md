# Design a surface

Start from the work the person describes. List what the agent must notice and the actions it needs to do that work. Make important facts visible at /; put depth at paths the agent can read when needed. Design the surface before its page.

## Model

Keep private domain state in one model: what is true and the status of operations. Presentation, navigation and private drafts belong to the page. Give objects stable identities. Independent domain state is another surface.

Only pure update writes the model. It receives admitted calls and command events as messages. Messages are serialized; commands may run concurrently and report events back. The model commits before publication.

Define the app with defineApp and AppDefinition from #babavoss/core/index.ts in src/app.ts. The surface supplies init, update, view, run and failed; restore and start are optional. Use start for commands needed when the surface starts. When saved state changes shape, make restore read what earlier versions saved and produce the current model. Preserve the person's data and exercise restoration before sharing changes. Keep data that must outlive the session outside session state, as described in [App](app.md).

## Views and handles

Make / a small summary: counts, names, operation status, relevant handles and paths for detail. Show the same domain object for every actor; offered handles may differ. A view is public facts and handles at a path, not a second model.

Offer each handle where its action applies. Describe one action plainly, with fixed arguments and typed open arguments. A call must repeat the fixed arguments and fit the open arguments. Admission checks the caller's current offered view. An invalid call is refused; make the reason useful for deciding the next action. Persistence inconsistency fails the surface.

Keep actions few and distinct. Walk a real task through its views, handles and refusals. Read the root view as present will show it: each fact should help the agent choose the next step.

## Design for programs

Expose lists as data, with each item's path. Make handles safe to repeat where the work allows it. Put facts at / that tell the agent what remains to do, so a program can choose its next action from the view.

## Commands and asks

Put effects outside update in commands: timers, file work and requests. Run performs them and reports events; failed handles command failure. Make operation status and errors visible so both agent and person can understand what happened. If an answer is lost after dispatch, the outcome is uncertain: read state before retrying. Stopping effects does not undo them.

An ask is a handle offered to the person only. Make the decision and its result visible in the surface; leave the decision to the person on the page.

Prove the task with a [scenario](playground.md) that includes the person's part. Ensure a person call changes facts the agent can notice in its next answer.

## Tests

Test a surface at its boundary, as stories. `story(app.surface)` from #babavoss/core/index.ts runs the surface inside the test and gives you its actors and the world outside it:

```ts
test("the agent learns of a note the person removed", async () => {
  const { agent, person, world } = story(app.surface)

  await agent.call("/", "add", { text: "Pharmacy" })
  agent.told()
  await person.call("/notes/1", "remove", { n: 1 })

  expect(agent.told()).toEqual(["notes.count: 1 → 0", 'latest: "Pharmacy" → null', "- clear"])
  expect(agent.sees("/notes/1")).toBeUndefined()
})
```

- `agent` and `person` each act as themselves. `sees(path)` is the view that actor gets, `offered(path)` the names of the handles it is offered there, `call(path, handle, args)` a call through real admission, answered with its outcome, a refusal and its reason included.
- `told()` is what that actor would be told changed since it was last told, in the lines a cli answer carries; the first time, the whole view. Assert it wherever one actor must learn what the other did.
- `world` holds every command the surface starts; the surface's own run is not called. `world.commands()` lists them, `world.settle(event)` reports an event back for the one pending, `world.fail(error)` ends it as thrown; name a command, or give a predicate, when several are pending. So no test waits on a timer or a request. `story(surface, { effects: "real" })` runs them for real, and `world.idle()` waits for them.
- `restart()` runs the surface again from what it saved, as a new process would. `story(surface, { model })` starts from a saved model, which is how to exercise restore on what an earlier version kept.

Write one test per rule, named in the person's words: bring the surface to a state by calls, make the call the rule is about, then assert what each actor sees, is offered and is told. Never read the model and never call update; a rule that cannot be shown through a view is not a rule of the app yet. Assert a handle offered to one actor and not the other wherever that is the rule. Keep one spec that goes through the real cli, to prove the door; everything else is a story. Specs live in spec/ and run with `bun test`.
