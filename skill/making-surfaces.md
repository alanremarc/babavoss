# Making surfaces

How a surface is made and changed. Read it whole before the first. Run `bun` commands from `.baba/`, and the shell's command, `.babavoss/bin/baba`, from the project's directory.

## The loop

1. `bun run baba new NAME` makes `surfaces/NAME/` from the template: a small surface that runs as it is, its page and its spec. NAME is lowercase kebab-case. Agree with the person what it is for and what they see in its tab; what they want of the agent that works it is theirs to say, never the surface's.
2. Change it into the surface wanted. `bun test surfaces/NAME` runs its specs; `bun check` checks its types.
3. Make the shell run it. The shell runs the code it started with; `/` says `code: changed on disk…` until it restarts. `.babavoss/bin/baba restart` restarts it, at the same address with every tab's state kept; with work under way it drains, then answers with an instance that `follow ID` waits for. Or set `dev: true` in `.baba/baba.config.ts` (below) while surfaces are being made: then any change restarts it at once, cutting what runs.
4. Open it, `.babavoss/bin/baba / open surface=NAME`, and give the person the page's address if they do not have it. Build it a step at a time, each ending in something they can see in its tab.

```text
surfaces/NAME/
  src/surface.ts   the surface, its default export
  ui/index.tsx     its page, the default export a component shown in its tab; `icon` and `drawers` may be exported too
  spec/            its rules, as stories
```

## A surface

A surface is a model, an update that changes it, and views that say what is true and what can be done. `update` is pure and synchronous; anything outside, a file, a process, the network, is a command, run outside the loop, which reports back by events.

```ts
export default surface<Model, Event, Command>({
  description: "The books the person reads, by status. Use when a book is added, its status set or the list read.",
  init: () => ({ books: [], next: 1 }),       // the first model; the model is JSON, kept per tab
  restore: (saved) => saved as Model,         // optional: the kept model, validated or migrated as the shape changes
  update: (m, message) => (message.kind === "call" ? pages.update(m, message) : heard(m, message)),
  view: pages.view,
  start: () => [{ kind: "watch-books-file" }], // optional: commands started with the surface
  session: (c) => c.kind === "watch-books-file", // optional: which commands run for the surface's life
  run: async (command, send, signal) => {},    // runs a command; it sends events and never writes the model
  failed: (command, error) => ({ kind: "none" }), // the event for a command that threw
})
```

`description` is how the shell lists the surface, and so how an agent chooses it: a phrase of what it does and a "Use when …".

## Mechanics only

A surface's words are all an agent learns of how it works, and nothing else is written beside it. Its `how`, its descriptions and its facts say what a thing is, what an action does and what must hold for it: "each book has one status", "a book added is to-read", "puts it in the lane, which must be free". They never say when the agent ought to act, how it should run its work, or who should decide: not "add a book when the person mentions one", not "ask the person first". An agent obeys such words where nobody asked.

What the person wants as a standing behaviour is theirs to write in the project's own instructions to its agent, such as `CLAUDE.md` or `AGENTS.md`; babavoss writes nothing there. For example:

```text
When I finish a book in conversation, mark it read in the books surface.
```

## Views and places

`view(actions, routes)` composes the views, one function a route, each the same for every reader. `/` is the surface's whole; give `title`, and `how`: what always holds, short, since it is read each time. Say what depends on the state where the state is, as a fact.

```ts
const pages = view([add, mark], {
  "/": (m) => ({ title: "Books", how: "Each book has one status. A book added is to-read.", reading: m.books.filter(…).map(row), add: add.bind({}) }),
  "/books/:id": (m, { id }) => { const b = find(m, Number(id)); return b && { ...row(b), mark: mark.bind({ id: b.id }) } },
})
const row = (b: Book) => ({ at: `/books/${b.id}`, id: b.id, title: b.title, status: b.status })
```

- A route's `:name` captures one segment, given as text: `{ id }` is a `string | undefined` to the type check, so read it as `Number(id)` or with a default.
- Every thing has its own path, and the rows that list it name it under `at`. A refresh, a copied link and the agent's `highlight` all land on it. A route with nothing there answers `undefined`.
- An action not offered now is left out of the view: offering is the rule, and a call of anything else is refused.
- What is there to be looked up rather than followed, finished rows or counters, wrap in `detail(value)`: the page and a read see it as usual; the present at `/` leaves it out and counts it in one line.
- A view may order its actions in the tab's menu with a `menu` fact, `[{ label: "Move", actions: ["start", "done"] }]`, the rest after; give it below `/`, where it stays out of the present.

## Actions

```ts
const mark = action({
  name: "mark",
  description: "",
  subject: { id: "number" },
  inputs: { status: { type: "string", choices: ["to-read", "reading", "read"] } },
  update: (m: Model, { id, status }): Update<Model, never> => ({ model: { ...m, books: m.books.map((b) => (b.id === id ? { ...b, status } : b)) } }),
})
```

- `name` says what it does. `description` is one clause that adds what the name does not say: its effect, or what must hold for it. It never repeats the name, its subject or the command, and never says when to call it; lower case, no full stop; empty where the name says it all. `done`: "its work is merged into main"; `start`: "puts it in the lane, which must be free"; `remove`: "".
- `subject` is fixed where the action is bound, `mark.bind({ id: b.id })`; `inputs` are given by the caller.
- An input declares its base type, `"string"`, `"number"` or `"boolean"`, and what it means where the type alone does not say: `kind`, a word, `line`, `markdown` and `path` being text the page's form knows, any other the surface's own, printed with its type as `id(string)`; `choices`, the values it may take; `range`, whole numbers, `[1, 5]`. Admission refuses a value outside them and says what is allowed, so the update need not check. Every input is required.
- `update` returns `{ model, notices?, commands? }`, or `{ refused: "why" }`, which changes nothing and tells the caller why.
- An action that is only the page's bookkeeping, as a fold the person opened, takes `quiet: true`: it is in no log and told to the agent in no way.

**Rows and the pattern.** The present at `/` prints the actions offered at each row's own path once for the whole list, as `/books/books/ID mark id=ID status=…`, so the agent acts on any row without reading it. An action is in the pattern where the list has two rows or more, each row's `at` holds one of its columns' values, the action's subject is that value, and its inputs and description are the same for every row. Anything else is left to the row's own read.

## The person's decisions

The agent and the person are offered the same actions, and nothing is locked. Which decisions are the person's, they and the project's instructions say: the agent raises such a decision in the conversation and acts on their word, or the person takes the same action on the page. A surface may state as a fact what only the person can know, "the person has read the draft". When something waits on the person, mark the notice that says so as a highlight (below). The template shows the shape: the agent proposes, both are offered accept and decline.

## What happened: notices, highlights and the log

The shell keeps a log of every action in a tab, by itself: when, who (the person, the agent or the world), where, the action and its inputs, and what came of it, done or refused with why. It is in the tab's drawer and at `/activity`; each tab's log and state are kept on disk, and a closed tab's are archived read only at `/activity/closed`.

A notice is a surface's own line about an action or event, one short sentence on what just happened. It is kept in the action's entry and told to the agent once, after its next tool call; the caller is not told back what its own call gave. What still holds afterwards is a fact, not a notice.

```ts
notices: [`"${title}" added`]
notices: [{ text: `"${text}" is proposed, to accept or decline`, highlight: true, at: "/proposal" }]
```

A notice marked `highlight: true` is a highlight: what the person should see, as a decision waiting on them or a run that failed. Their page shows a bubble beside the tab and a dot on it until they open its drawer, where highlights are what stands out and everything else is folded between them; the agent hears it first. The agent raises one of its own with the shell's `highlight`. Mark only what deserves it.

## Hearing the world

What changes outside the surface, a file the person edits or a process that ends, is heard by a session command: started by `start`, kept running by `session`, run by `run`, sending an event on each change. Name its `kind` for what it hears, `watch-books-file`: an event of a session command is the world's in the log, named by that kind, and silent ones in a row fold into one entry. One that changes nothing and says nothing leaves no entry. A command started by a call is the caller's work instead, logged only where the surface gives a notice.

```ts
import { watch } from "node:fs"
const FILE = new URL("../../../../books.json", import.meta.url) // .baba/surfaces/NAME/src/ → the project's directory

run: async (command, send, signal) => {
  const read = () => send({ kind: "file-read", books: JSON.parse(readFileSync(FILE, "utf8")) })
  const watcher = watch(FILE, read)
  read()
  await new Promise((done) => signal.addEventListener("abort", done, { once: true }))
  watcher.close()
},
```

The update takes the event like a call and returns the next model. A surface that writes the file too should compare before it writes, so its own write heard back changes nothing. A command is cut when the shell restarts or sleeps and sends nothing more: keep long work resumable from the model.

## Specs are stories

A spec tells the surface's rules as a story: actors see, call and are told; the test is the world; the model is never read.

```ts
import { story } from "babavoss/core/index.ts"
import books from "../src/surface.ts"

test("a book added is to-read, and the person sets its status on the page", async () => {
  const { agent, person, world } = story(books)

  expect(await agent.call("/", "add", { title: "Dune" })).toMatchObject({ outcome: "written" })
  expect(await person.call("/books/1", "mark", { id: 1, status: "reading" })).toMatchObject({ outcome: "written" })
  expect(agent.sees()).toMatchObject({ reading: [{ title: "Dune" }] })
})
```

- `sees(path?)`, `offered(path?)`, `call(path, handle, args)`; `told()`, what changed since it last asked, as the agent is told; `noticed()`, the notices since it last asked, a highlight as `highlight: TEXT`.
- The test holds every command the surface starts; none runs. `await world.settle(command, event)` ends one with its event; one that keeps running, as a session command, is given events one at a time by `await world.send(command, event)`, the actors looking between, and ended by `await world.end(command)`. Name the command by a test of it, `(c) => c.kind === "watch-books-file"`, or leave it out where one is running; `world.commands()` lists them. `story(surface, { model })` starts from a model.

```ts
const { agent, world } = story(books)
const watching = (c: Command) => c.kind === "watch-books-file"

await world.send(watching, { kind: "file-read", books: [{ title: "Dune", status: "reading" }] })
expect(agent.sees()).toMatchObject({ reading: [{ title: "Dune" }] })
```

## The page

`ui/index.tsx` is a React component the shell shows in the surface's tab. It reads the views live and calls the same actions:

```tsx
import { Button } from "babavoss/kit/index.ts"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"

export default function Books() {
  const { view, error } = useLive<Root>("/")
  const { call, route, navigate } = useTab()
  …
}
```

- A view changed by anyone replaces the one shown, in place. The tab is shown once its first reads answer, so a page draws no loading state of its own.
- `call(path, handle, args)` answers `{ outcome: "written", view }` or `{ outcome: "refused", reason }`; show the reason.
- Keep what is selected in the tab's route, never in component state: `route` is the path within the tab and `navigate(route)` moves it. A route the surface does not know falls back to something sensible, never an error.
- The shell gives every tab a drawer with its menu: the surface's actions, its places, a search, and its activity. A page does not repeat it. An action with inputs opens a form made from the declared inputs; `export const drawers = { add: AddBook }` replaces it for that action, a component given `{ handle, path, view, submit, close }`. `export const icon = <BookIcon />` is the tab's icon.
- Whose move it is is the shell's: a page draws no busy indicator or end-of-move button.

**Looks.** Build with the kit, `babavoss/kit/index.ts`, shadcn's primitives with one layer of opinions, then the project's own shadcn components (`bunx shadcn@latest add NAME` in `.baba/`, imported as `@/components/ui/NAME`). Never hard-code a colour, a font or a size where a token fits: the tokens follow the person's theme and mode.

- colour: `background`/`foreground`, `muted`/`muted-foreground`, `card`, `popover`, `secondary`, `primary` (the one action, the selected), `accent` (a hovered or current row), `destructive`, `success`, `warning`, `info`, `border`, `input`, `ring`, `chart-1`…`chart-5`; as `bg-primary`, `text-muted-foreground`, `bg-success/10`.
- type: `text-badge`, `text-meta`, `text-body` (the default), `text-large`; Tailwind's `text-sm` and up for headings. Size text in rem, never px.
- frame: `h-menubar`, `h-bar`, `h-row`; `size-icon`, `size-glyph`. Spacing is Tailwind's.

**Conventions.** The shell hands every page how the person wants pages to be: `motion` (`full` or `reduced`), `scale`, `side` (where a page's own sidebar stands), `rail` (where the tabs stand), `mode`. Read them with `useConventions()`, or in CSS by the variants `motion-safe:`, `motion-reduce:`, `side-left:`, `side-right:`, `rail-left:`…`rail-bottom:` and `dark:`. The kit follows them unasked; a page that moves by script or has a sidebar follows them by its own code.

```tsx
<div className="flex side-left:flex-row-reverse">…</div>
row.scrollIntoView({ behavior: useConventions().motion === "reduced" ? "auto" : "smooth" })
```

**More.** A library: `bun add NAME` in `.baba/`, then import it; its stylesheet is imported from the page and restyled to the tokens. `ui/styles.css` beside the component is the surface's own stylesheet, scoped to its tabs; `:scope { --name: … }` sets its own tokens; do not import it from the page. Tailwind sees every file in `.baba/` but `node_modules`; a package whose classes must be generated is named by `@source "../../../node_modules/NAME";` in it.

## Home

The mark on the rail shows home, by default a desktop of the surfaces. `.baba/home.tsx`, where it exists, takes its place: a component given `HomeProps` from `babavoss/shell/ui/index.tsx` (`title`, `notice`, `surfaces`, `tabs`, `foot`), drawn with the kit.

## What may be imported

The framework is the package `babavoss`, imported only by its entries; anything else does not resolve.

- `babavoss/core/index.ts`, for a surface's source and specs: `surface`, `view`, `action`, `detail`, `story`, `Update` and the rest; a page takes its types, as `Handle`.
- `babavoss/kit/index.ts`, for a page: the primitives and `cn`.
- `babavoss/shell/ui/index.tsx`, for a page: `useLive`, `useTab`, `useShell`, `useConventions`, `DrawerProps`, `HomeProps`.
- `babavoss/core/config.ts`, for `.baba/baba.config.ts` alone.

What a surface needs beyond them it keeps in its own folder.

## How the agent works it

The agent reads views and calls actions one at a time, or many in one program: `.babavoss/bin/baba -e - <<'EOF'` with `await read(path)`, a view as data, each action in it as `{ handle, args, inputs }`; `await call(path, handle, { name: value })`, which throws on a refusal; and `print(…)`. So give rows the values a program filters by, as `status`, and their `at`, and a batch needs no reading of each row.

## Configuration

```ts
import { config } from "babavoss/core/config.ts"

export default config({
  title: "Reading desk",
  dev: true,
  harnesses: { claude: { enable: true }, codex: { enable: false } },
})
```

`title` names the root on the page and at `/`; the project's directory by default. `dev: true` restarts the shell at once whenever its code changes; absent or false, it runs the code it started with until restarted; `BABAVOSS_DEV=1` or `0` overrides it. Each harness has a section: `enable: false` takes back what was written for it at the next `bun run baba provision`; `events` lists the hook's events that tell anything, all by default; Codex's `network: true` opens its sandbox's network so the command reaches the shell. Each harness is set up the same way: baba's skill, in `.claude/skills/baba` or `.agents/skills/baba`, and its hooks among yours in the harness's own project file, `.claude/settings.json` or `.codex/hooks.json`; that file as it was is copied to `.babavoss/backups/` before a change, and Codex asks the person to trust the hooks once in `/hooks`. Installing provisions; `bun run baba provision` does it again.

## Updating

When an answer says a later babavoss is out, it names the command that takes it; whether and when is the person's. Once taken, read `node_modules/babavoss/CHANGELOG.md` from the version the surfaces ran on up (the version before is in `.baba/package.json`'s history or `bun.lock`), adapt the surfaces to each change it names, run `bun check` and their specs, and restart the shell to run the version taken.
