// The scenarios, one table: each a script of steps played on the demo project, in order. A step is one move by one party:
// the harness starting or stopping the session, or no longer running its hooks; the person speaking, acting on the page or
// opening a tab's drawer; the agent reading, calling, waiting, running a program or using another tool through its
// harness; the build moving by itself; the demo's code changing under the root; the root going to sleep. The canonical
// scenarios are the ordinary moments of a session; the noise scenarios each show one kind of telling the agent does not
// need, measured on today's code, so a change to what is told shows there. Nothing told is written here.
// The demo's tabs open in the order the script opens them: tasks is /tabs/1 wherever it is opened first.

export type Step =
  /** The harness starts the session, resumes it, or starts it again after a compaction: its SessionStart hook. */
  | { kind: "start"; source: "startup" | "resume" | "compact" }
  /** The person sends a message: the UserPromptSubmit hook. */
  | { kind: "say"; text: string }
  /** The agent reads a path with the word, a tool call: its answer, then the PostToolUse hook. */
  | { kind: "read"; path: string }
  /** The agent calls a handle with the word: its answer, then the PostToolUse hook. */
  | { kind: "call"; path: string; handle: string; args?: Record<string, string> }
  /** The agent starts `wait SECONDS` with the word; its answer comes at the next `waited`. */
  | { kind: "wait"; seconds: number }
  /** The wait ends: its answer, then the PostToolUse hook. */
  | { kind: "waited" }
  /** The agent uses another of the harness's tools, an edit or a test run: only the PostToolUse hook. */
  | { kind: "tool"; what: string }
  /** The person calls a handle on the page. */
  | { kind: "act"; path: string; handle: string; args?: Record<string, string | number> }
  /** The build moves by itself: a status line, `running`, `passed` or `failed: why`. */
  | { kind: "build"; line: string }
  /** The agent's turn ends: the Stop hook. */
  | { kind: "stop" }
  /** The root goes to sleep, as the agent's `sleep` puts it, or nothing used it for a while; the next command wakes it. */
  | { kind: "sleep" }
  /** The person marks every notice seen, or opens the drawer of the newest notice's tab, which marks it seen: the page's `seen` or `looked`. */
  | { kind: "look"; mark: "seen" | "looked" }
  /** The person's page goes where the agent last pointed it, as when the person follows the offer. */
  | { kind: "go" }
  /** The person makes several calls on the page in a row, as by clicking down a list. */
  | { kind: "acts"; what: string; calls: { path: string; handle: string; args?: Record<string, string | number> }[] }
  /** The agent runs one program with the word's `-e`. */
  | { kind: "program"; what: string; code: string }
  /** The demo's code changes on disk: each edit replaces text in a file of a surface, which must be there. */
  | { kind: "code"; what: string; surface: string; file: string; edits: [string, string][] }
  /** The root is seen to have loaded the code changed last, waited on as its surfaces' descriptions at / show it, bounded. */
  | { kind: "reloaded" }
  /** The harness stops running the framework's hooks, or runs them again. */
  | { kind: "hooks"; on: boolean }
  /** Time passes with no call, as while the agent thinks: seconds on the demo's clock, which pass at once. */
  | { kind: "pause"; seconds: number }

/** A step as a script has it: `timing` says why what it was told may vary with timing, and so is recorded, not settled. */
export type Scripted = Step & { timing?: string }
/** `group`: the canonical moments, or a kind of noise. */
export type Scenario = { name: string; group: "canonical" | "noise"; title: string; about: string; steps: Scripted[] }
export const GROUPS: Record<Scenario["group"], string> = { canonical: "Canonical", noise: "Noise" }

const opened = (...surfaces: string[]): Scripted[] => surfaces.map((surface) => ({ kind: "call", path: "/", handle: "open", args: { surface } }))

/** A program that adds each title as a task at a tab, printing each call's outcome. */
const adding = (tab: string, titles: string[]) => `for (const title of ${JSON.stringify(titles)}) console.log((await root.call(${JSON.stringify(tab)}, "add", { title })).outcome)`

const RELEASE = [
  "Freeze the branch",
  "Write the notes",
  "Bump the version",
  "Update the changelog",
  "Run the full specs",
  "Check the docs build",
  "Tag the release",
  "Publish the package",
  "Announce it",
  "Close the milestone",
  "Open the next one",
  "Thank the contributors",
]
const FORTY = Array.from({ length: 40 }, (_, i) => `${["Port", "Check", "Write", "Review", "Fix"][i % 5]} part ${i + 1} of the release`)

export const SCENARIOS: Scenario[] = [
  {
    name: "start",
    group: "canonical",
    title: "A session starts",
    about: "A fresh session on the demo project, no tab open: what the agent is given before and with the person's first message.",
    steps: [{ kind: "start", source: "startup" }, { kind: "say", text: "Let's plan the release." }, { kind: "stop" }],
  },
  {
    name: "work",
    group: "canonical",
    title: "The agent works a surface",
    about: "The agent opens tasks, reads it, adds two, reads one and marks it done: every answer, and the hook after each call.",
    steps: [
      { kind: "start", source: "startup" },
      { kind: "say", text: "Track the release as tasks." },
      ...opened("tasks"),
      { kind: "read", path: "/tabs/1" },
      { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Write the notes" } },
      { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Tag the release" } },
      { kind: "read", path: "/tabs/1/tasks/1" },
      { kind: "call", path: "/tabs/1/tasks/1", handle: "done" },
      { kind: "stop" },
    ],
  },
  {
    name: "beside",
    group: "canonical",
    title: "The person acts while the agent works",
    about:
      "The person adds a task on the page and the build moves by itself while the agent edits: what is heard after a tool call; then the person acts between turns, told with their next message.",
    steps: [
      { kind: "start", source: "startup" },
      { kind: "say", text: "Add a task for the changelog and keep an eye on the build." },
      ...opened("tasks", "build"),
      { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Write the changelog" } },
      { kind: "act", path: "/tabs/1", handle: "add", args: { title: "Bump the version" } },
      { kind: "tool", what: "edit CHANGELOG.md" },
      { kind: "build", line: "running" },
      { kind: "tool", what: "run the specs" },
      { kind: "build", line: "failed: 2 specs fail" },
      { kind: "tool", what: "edit spec/notes.spec.ts" },
      { kind: "stop" },
      { kind: "act", path: "/tabs/1/tasks/2", handle: "done", args: { n: 2 } },
      { kind: "build", line: "running" },
      { kind: "build", line: "passed" },
      { kind: "say", text: "Where are we?" },
    ],
  },
  {
    name: "ask",
    group: "canonical",
    title: "An ask",
    about: "The agent marks a task done and waits; the person approves it on the page, which only they may; the wait ends with what they did.",
    steps: [
      { kind: "start", source: "startup" },
      { kind: "say", text: "Write the notes and have me check them." },
      ...opened("tasks"),
      { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Write the notes" } },
      { kind: "tool", what: "write NOTES.md" },
      { kind: "call", path: "/tabs/1/tasks/1", handle: "done" },
      { kind: "wait", seconds: 30 },
      { kind: "act", path: "/tabs/1/tasks/1", handle: "approve", args: { n: 1 } },
      { kind: "waited" },
      { kind: "stop" },
    ],
  },
  {
    name: "break",
    group: "canonical",
    title: "A break",
    about:
      "Work, then a compaction mid-turn, then the root asleep overnight and the session resumed: what the agent is given back, and catching up from / and /activity.",
    steps: [
      { kind: "start", source: "startup" },
      { kind: "say", text: "Track the release as tasks." },
      ...opened("tasks", "build"),
      { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Write the notes" } },
      { kind: "act", path: "/tabs/1", handle: "add", args: { title: "Tag the release" } },
      { kind: "build", line: "running" },
      { kind: "start", source: "compact" },
      { kind: "read", path: "/activity" },
      { kind: "stop" },
      { kind: "act", path: "/tabs/1/tasks/1", handle: "done", args: { n: 1 } },
      { kind: "build", line: "passed" },
      { kind: "sleep" },
      { kind: "start", source: "resume" },
      { kind: "say", text: "Where were we?" },
      { kind: "read", path: "/" },
      { kind: "read", path: "/activity" },
      { kind: "stop" },
    ],
  },
  ...NOISE(),
]

/** The noise scenarios: each the plainest case of one kind of telling the agent does not need. */
function NOISE(): Scenario[] {
  return [
    {
      name: "housekeeping",
      group: "noise",
      title: "The person looks at the activity",
      about:
        "While the agent works, the person opens a tab's drawer and marks what is new seen, follows where the agent pointed them, and changes a setting: the page's own housekeeping, none of it the agent's business. Is any of it told?",
      steps: [
        { kind: "start", source: "startup" },
        { kind: "say", text: "Add the release tasks and watch the build." },
        ...opened("tasks", "build"),
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Write the notes" } },
        { kind: "build", line: "running" },
        { kind: "build", line: "failed: 1 spec fails" },
        { kind: "look", mark: "looked" },
        { kind: "tool", what: "edit spec/notes.spec.ts" },
        { kind: "look", mark: "seen" },
        { kind: "call", path: "/", handle: "show", args: { at: "/tabs/1/tasks/1" } },
        { kind: "go" },
        { kind: "act", path: "/", handle: "open", args: { surface: "settings" } },
        { kind: "act", path: "/tabs/3", handle: "theme", args: { mode: "dark", theme: "claude" } },
        { kind: "tool", what: "run the specs" },
        { kind: "stop" },
        { kind: "say", text: "Go on." },
        { kind: "read", path: "/tabs/1/tasks/1" },
        { kind: "stop" },
        { kind: "sleep" },
        { kind: "say", text: "Back. Where were we?" },
        { kind: "read", path: "/tabs/1" },
        { kind: "stop" },
        { kind: "say", text: "Thanks." },
      ],
    },
    {
      name: "explained",
      group: "noise",
      title: "One event, one line",
      about:
        "Twelve tasks; the person approves one on the page. It is one event: is it told as one line, or as the notice, the row's status, the need gone and the whole new order of the list?",
      steps: [
        { kind: "start", source: "startup" },
        { kind: "say", text: "Plan the release as tasks; I'll approve them as they are done." },
        ...opened("tasks"),
        { kind: "program", what: "add the twelve release tasks", code: adding("/tabs/1", RELEASE) },
        { kind: "call", path: "/tabs/1/tasks/3", handle: "done" },
        { kind: "stop" },
        { kind: "act", path: "/tabs/1/tasks/3", handle: "approve", args: { n: 3 } },
        { kind: "say", text: "Next one." },
      ],
    },
    {
      name: "elsewhere",
      group: "noise",
      title: "A tab the agent is not working in",
      about:
        "Tasks and build are open; the agent works in tasks over two turns while the build runs again and again, by itself and at the person's asking. How much of the build comes with the person's message?",
      steps: [
        { kind: "start", source: "startup" },
        { kind: "say", text: "Write the notes as tasks." },
        ...opened("tasks", "build"),
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Draft the notes" } },
        { kind: "build", line: "running" },
        { kind: "build", line: "passed: 212 specs" },
        { kind: "tool", what: "write NOTES.md" },
        { kind: "act", path: "/tabs/2", handle: "rerun" },
        { kind: "build", line: "running" },
        { kind: "build", line: "failed: 1 spec fails" },
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Proofread the notes" } },
        { kind: "stop" },
        { kind: "act", path: "/tabs/2", handle: "rerun" },
        { kind: "build", line: "running" },
        { kind: "build", line: "passed: 214 specs" },
        { kind: "build", line: "running" },
        { kind: "build", line: "passed: 214 specs" },
        { kind: "say", text: "And the proofreading?" },
        { kind: "call", path: "/tabs/1/tasks/2", handle: "done" },
        { kind: "stop" },
      ],
    },
    {
      name: "long",
      group: "noise",
      title: "What is detail",
      about:
        "Forty tasks, thirty of them done with a note each, and the present at / told at a session's start, after a compaction and on a read of /: is every row told, the done ones too?",
      steps: [
        { kind: "start", source: "startup" },
        { kind: "say", text: "Track the port as tasks." },
        ...opened("tasks"),
        {
          kind: "program",
          what: "add forty tasks, note thirty and mark them done",
          code:
            `for (const title of ${JSON.stringify(FORTY)}) await root.call("/tabs/1", "add", { title })\n` +
            `for (let n = 1; n <= 30; n++) {\n` +
            `  await root.call(\`/tabs/1/tasks/\${n}\`, "annotate", { n, text: \`Checked on staging, see PR #\${100 + n}\` })\n` +
            `  await root.call(\`/tabs/1/tasks/\${n}\`, "done", { n })\n` +
            `}\n` +
            `console.log("40 added, 30 in review")`,
        },
        { kind: "stop" },
        { kind: "acts", what: "approves tasks 1 to 30", calls: Array.from({ length: 30 }, (_, i) => ({ path: `/tabs/1/tasks/${i + 1}`, handle: "approve", args: { n: i + 1 } })) },
        { kind: "start", source: "resume" },
        { kind: "say", text: "Where are we with the port?" },
        { kind: "start", source: "compact" },
        { kind: "read", path: "/" },
        { kind: "stop" },
      ],
    },
    {
      name: "moved",
      group: "noise",
      title: "A place that moves",
      about:
        "The agent works in tasks; the person closes the tab and opens tasks again, a new tab. The agent calls the old path: is it told where tasks went?",
      steps: [
        { kind: "start", source: "startup" },
        { kind: "say", text: "Track the release as tasks." },
        ...opened("tasks"),
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Write the notes" } },
        { kind: "act", path: "/", handle: "close", args: { n: 1 } },
        { kind: "act", path: "/", handle: "open", args: { surface: "tasks" } },
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Tag the release" } },
        { kind: "read", path: "/tabs/1/tasks/1" },
        { kind: "read", path: "/" },
        { kind: "call", path: "/tabs/2", handle: "add", args: { title: "Tag the release" } },
        { kind: "stop" },
      ],
    },
    {
      name: "reload",
      group: "noise",
      title: "A reload under the agent",
      about:
        "While the agent works, the tasks surface's code changes on disk: its description, its how and a fact at /. The agent calls while the root loads it and after: what reaches it of the reload?",
      steps: [
        { kind: "start", source: "startup" },
        { kind: "say", text: "Track the release as tasks." },
        ...opened("tasks"),
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Write the notes" } },
        {
          kind: "code",
          what: "the tasks surface gains a fact at /, and its description and how change",
          surface: "tasks",
          file: "src/surface.ts",
          edits: [
            ['description: "Track the project\'s tasks. Use when work is asked for."', 'description: "Track the project\'s tasks and when they are due. Use when work is asked for."'],
            ['title: "Tasks",', 'title: "Tasks",\n      due: "Friday",'],
            ['they approve it on the page."', 'they approve it on the page; say when one is due."'],
          ],
        },
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Tag the release" }, timing: "called while the root loads the changed code: what it is told depends on how far the reload is" },
        { kind: "reloaded" },
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Publish the package" } },
        { kind: "tool", what: "edit NOTES.md" },
        { kind: "stop" },
        { kind: "say", text: "Go on." },
      ],
    },
    {
      name: "quiet",
      group: "noise",
      title: "Hooks that stop",
      about:
        "The hooks are heard for one turn, then the harness no longer runs them, while the agent's commands go on, a pause among them. Is the agent told the hooks went quiet, and that what the person does no longer reaches it?",
      steps: [
        { kind: "start", source: "startup" },
        { kind: "say", text: "Track the release as tasks." },
        ...opened("tasks"),
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Write the notes" } },
        { kind: "stop" },
        { kind: "hooks", on: false },
        { kind: "say", text: "Add the tag too." },
        { kind: "call", path: "/tabs/1", handle: "add", args: { title: "Tag the release" } },
        { kind: "act", path: "/tabs/1", handle: "add", args: { title: "Publish the package" } },
        { kind: "tool", what: "edit NOTES.md" },
        { kind: "pause", seconds: 11 },
        { kind: "call", path: "/tabs/1/tasks/1", handle: "done" },
        { kind: "act", path: "/tabs/1/tasks/1", handle: "reopen", args: { n: 1 } },
        { kind: "read", path: "/tabs/1/tasks/2" },
        { kind: "stop" },
      ],
    },
  ]
}
