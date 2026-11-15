// The canonical scenarios, one table: each a script of steps played on the demo project, in order. A step is one move by
// one party: the harness starting or stopping the session, the person speaking or acting on the page, the agent reading,
// calling, waiting or using another tool through its harness, the build moving by itself, the root going to sleep.
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
  /** The root goes to sleep, as when nothing called it for a while; the next command wakes it. */
  | { kind: "sleep" }

export type Scenario = { name: string; title: string; about: string; steps: Step[] }

const opened = (...surfaces: string[]): Step[] => surfaces.map((surface) => ({ kind: "call", path: "/", handle: "open", args: { surface } }))

export const SCENARIOS: Scenario[] = [
  {
    name: "start",
    title: "A session starts",
    about: "A fresh session on the demo project, no tab open: what the agent is given before and with the person's first message.",
    steps: [{ kind: "start", source: "startup" }, { kind: "say", text: "Let's plan the release." }, { kind: "stop" }],
  },
  {
    name: "work",
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
]
