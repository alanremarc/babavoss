// The eval's fixture's work as every run begins with it: thirty issues on four narratives, three of them in lanes 1, 3 and 4,
// twelve in the backlog, five drafts and ten done. Written out by hand, so it is the same each time; the tasks' checks read
// what a run began with from the root, so a variant may change it and its checks follow.
import type { Issue, Narrative, Status, Work } from "./surface.ts"

export const narratives: Narrative[] = [
  { id: "told", title: "What the agent is told", about: "How a surface appears in an agent's context." },
  { id: "alive", title: "A root that stays up", about: "The runtime survives broken code and restarts." },
  { id: "shell", title: "The shell as a desktop", about: "What the root surface offers every surface." },
  { id: "lab", title: "Watching an agent use it", about: "Tooling to see what an agent sees and does." },
]

/** n, status, narrative, the issues it came out of, title, about, and a lane or a note where it has one. */
type Row = [number, Status, string, number[], string, string, { lane?: number; note?: string }?]

const rows: Row[] = [
  [1, "done", "told", [], "Give the present at a session's start", "The hook adds the whole present once, before the first message."],
  [2, "done", "alive", [], "Contain a tab whose code throws", "A broken tab is marked broken; the rest of the root keeps answering."],
  [3, "backlog", "told", [1], "Fold repeated notices into one line", "Three notices of the same kind in a row read as one line with a count."],
  [4, "done", "shell", [], "Show every open tab on a rail", "The rail lists the tabs, newest beside the mark."],
  [5, "backlog", "alive", [2], "Say why a runtime did not start", "The command prints the last lines the runtime logged when it fails to start."],
  [6, "backlog", "shell", [4], "Let the person reorder the rail", "Dragging a tab moves it along the rail, and the order is kept."],
  [7, "done", "lab", [], "Run an agent in a copy of the project", "A lab run copies the checkout and starts an agent in it with a home of its own."],
  [8, "backlog", "lab", [7], "Compare two runs side by side", "Two runs' timelines shown next to each other, aligned by turn."],
  [9, "done", "told", [1], "Tell only what changed with a message", "With the person's message the agent hears what changed at /, not the whole."],
  [10, "draft", "shell", [4], "A compact rail for small screens", "Below a width the rail shows icons only."],
  [11, "backlog", "told", [9], "Cut long facts in the present", "A fact longer than a line is cut in the present, with where to read it whole."],
  [12, "backlog", "alive", [5], "Rotate the runtime's log", "The log is cut to its last megabyte when it grows past two.", { note: "the log grows without bound" }],
  [13, "backlog", "shell", [6], "Name the busy lane in a refusal", "A refused start says which issue holds the lane."],
  [14, "done", "alive", [2], "Restart the root when its code changes", "In dev mode a change to a surface's code restarts the root at once."],
  [15, "backlog", "lab", [8], "Export a run's timeline as text", "A run's timeline can be copied as plain text for a report."],
  [16, "draft", "told", [9], "Say the command once per answer", "An answer names the command once at its head instead of on every action."],
  [17, "backlog", "told", [11], "Count detail rows in one line", "Rows marked detail are counted in the present, not listed."],
  [18, "done", "shell", [4], "A drawer for every tab", "Each tab's drawer has its menu over its activity."],
  [19, "backlog", "alive", [14], "Keep tabs through a restart", "A restart keeps every tab and its state."],
  [20, "draft", "shell", [18], "Pin a drawer open", "The person can keep a tab's drawer open beside the page."],
  [21, "lane", "told", [9], "Shorten the words at a session's start", "The skill's words at a start are cut to what every session needs.", { lane: 1, note: "rewriting the first section" }],
  [22, "backlog", "shell", [18], "Search the drawer's actions", "Typing in a drawer filters its actions and places."],
  [23, "done", "lab", [7], "Show what entered the agent's context", "A run's timeline shows each hook's text and each answer, with sizes."],
  [24, "lane", "alive", [14], "Wake the runtime by the strength of a request", "A session's start wakes it briefly; a command or a message for longer.", { lane: 3, note: "measuring wake times" }],
  [25, "draft", "lab", [23], "Replay a run against a new version", "A recorded run's messages are said again to an agent on another checkout."],
  [26, "backlog", "lab", [23], "Show a run's cost in its header", "The run's dollars and tokens so far stand in its header."],
  [27, "lane", "shell", [18], "Keep a tab's route in its address", "The route within a tab is part of the page's address.", { lane: 4 }],
  [28, "done", "told", [9], "Point the person to a place", "highlight marks a place for the person and may bring it to the front."],
  [29, "draft", "shell", [27], "Open a tab beside another", "Two tabs shown side by side, split by a handle."],
  [30, "done", "lab", [23], "Fold a run's injections", "Injected context is folded in the timeline, its size shown."],
]

/** The work every run begins with. */
export const seed = (): Work => ({
  narratives,
  issues: rows.map(([n, status, narrative, from, title, about, more]): Issue => ({ n, title, about, status, order: n, narrative, from, ...more })),
  next: rows.length + 1,
  clock: rows.length + 1,
})
