// The map's first state: the real history of babavoss as issues on five narratives, each with the reasoning of its iterations.
import type { Iteration, Narrative, Node } from "./surface.ts"

const it = (title: string, why: string, decided: string, outcome: string): Iteration => ({ title, why, decided, outcome })

export const narratives: Narrative[] = [
  { id: "told", title: "What the agent is told", about: "How a surface appears in an agent's context." },
  { id: "alive", title: "A root that stays up", about: "The runtime survives broken code and restarts." },
  { id: "shell", title: "The shell as a desktop", about: "What the root surface offers every surface." },
  { id: "lab", title: "Watching an agent use it", about: "Tooling to see what an agent sees and does." },
  { id: "queue", title: "Tracking the work", about: "This queue itself." },
]

export const nodes: Node[] = [
  {
    n: 9,
    title: "Track the work in a queue surface",
    status: "done",
    narrative: "queue",
    from: [],
    iterations: [
      it(
        "A stack of issues",
        "The work had no place where the person could see what is next.",
        "A vertical stack of issues with lanes for the subagents.",
        "The queue was built.",
      ),
      it(
        "Dense, with drafts",
        "The stack was roomy and the agent added issues nobody asked for.",
        "One-liners in a right sidebar, and drafts the person approves.",
        "The queue reads at a glance and the person owns the backlog.",
      ),
      it(
        "Readable issues",
        "An issue's text was plain and a refresh lost the selection.",
        "Issue text as markdown with tables, selection kept in the address.",
        "Issues read well and a link lands on one.",
      ),
    ],
  },
  {
    n: 11,
    title: "Keep the root alive through a surface's changes",
    status: "done",
    narrative: "alive",
    from: [9],
    iterations: [
      it(
        "Contain a broken tab",
        "A queue tab opened on stale state took every read down.",
        "A tab that fails is contained in the shell, the rest keeps working.",
        "A broken tab no longer takes the root down.",
      ),
    ],
  },
  {
    n: 15,
    title: "Finish containing a failing tab",
    status: "done",
    narrative: "alive",
    from: [11],
    iterations: [
      it(
        "Close the gaps",
        "Issue 11 left three ways a failing tab still leaked out.",
        "Close each of the three gaps with a spec.",
        "A failing tab is contained in every case known.",
      ),
    ],
  },
  {
    n: 13,
    title: "Make a changed surface reload every time",
    status: "done",
    narrative: "alive",
    from: [11],
    iterations: [
      it(
        "Reload after a branch switch",
        "Hot reload died after a branch switch.",
        "Reproduce it first, then fix the runtime's reload.",
        "A changed surface reloads every time.",
      ),
    ],
  },
  {
    n: 14,
    title: "Weave the shared surface into baba's words",
    status: "done",
    narrative: "told",
    from: [9],
    iterations: [
      it(
        "Shared and live",
        "The agent treated the person's changes as errors.",
        "The words say a surface is shared and live, and changes are attributed.",
        "The agent takes up the person's moves instead of undoing them.",
      ),
    ],
  },
  {
    n: 10,
    title: "Shape how the surface appears to the agent",
    status: "done",
    narrative: "told",
    from: [14],
    iterations: [
      it(
        "What does the agent see",
        "Nobody knew what the agent actually sees.",
        "Design eval tooling first: the lab.",
        "The lab was designed before any wording changed.",
      ),
      it(
        "Build the lab",
        "The design needed a running tool to answer the question.",
        "Implement the lab's design so far.",
        "Runs could be watched end to end.",
      ),
      it(
        "A new format",
        "The present was long and came mid-turn.",
        "A heading per tab, rows by identity; the present at boundaries, notices during work.",
        "Mid-turn injection was halved.",
      ),
    ],
  },
  {
    n: 27,
    title: "Run the lab on this project, isolated, through an adapter we own",
    status: "done",
    narrative: "lab",
    from: [10],
    iterations: [
      it(
        "A copy we control",
        "The lab ran a demo with the person's real home.",
        "Run a copy of this checkout in a directory we control, through our own harness adapter.",
        "Runs are isolated and on the real project.",
      ),
    ],
  },
  {
    n: 16,
    title: "Name the UI kit apart from the shell",
    status: "done",
    narrative: "shell",
    from: [9],
    iterations: [
      it(
        "The kit stands alone",
        "The kit was part of the shell.",
        "Make it babavoss/kit, so the shell is just a surface.",
        "Pages import the kit; the shell is one surface among them.",
      ),
    ],
  },
  {
    n: 17,
    title: "Make the shell the root surface",
    status: "done",
    narrative: "shell",
    from: [16],
    iterations: [it("One root", "The root and the shell were two things.", "Merge them and retire the picker.", "The shell is the root surface of .baba/.")],
  },
  { n: 18, title: "Put a + tab first in the strip, newest tabs next", status: "done", narrative: "shell", from: [17], iterations: [] },
  { n: 19, title: "Give surfaces the shell's theming tokens", status: "done", narrative: "shell", from: [17], iterations: [] },
  {
    n: 20,
    title: "Let a surface ask for attention, notify, and show health",
    status: "done",
    narrative: "shell",
    from: [17],
    iterations: [
      it(
        "All as facts",
        "A surface had no way to say it needs someone or is broken.",
        "Attention, notice and broken as facts at /.",
        "Proposed to the person.",
      ),
      it(
        "A notice is an event",
        "The person said a notice is an event, not a fact.",
        "Notices became an event stream from update.",
        "Facts stand; notices are told once.",
      ),
    ],
  },
  { n: 21, title: "Show the turn in the strip", status: "done", narrative: "shell", from: [17], iterations: [] },
  { n: 22, title: "Give every place an address the agent can point to", status: "done", narrative: "shell", from: [17], iterations: [] },
  { n: 23, title: "Keep the activity across surfaces", status: "done", narrative: "shell", from: [20], iterations: [] },
  { n: 24, title: "Give every surface a common frame", status: "done", narrative: "shell", from: [17], iterations: [] },
  {
    n: 28,
    title: "Keep notifications in the strip, where toasts go to rest",
    status: "done",
    narrative: "shell",
    from: [20, 23],
    iterations: [
      it(
        "One bell",
        "Notifications and activity were two components.",
        "Make them one bell in the strip.",
        "Toasts rest where the person finds them again.",
      ),
    ],
  },
  {
    n: 29,
    title: "Close what the last iteration left open",
    status: "done",
    narrative: "alive",
    from: [10, 27, 28, 15],
    iterations: [
      it(
        "One contract",
        "Twelve leftovers were scattered; some checked twice, some never.",
        "Asks as a flag, the type scale, one check in one place.",
        "The contract is checked in one place.",
      ),
      it(
        "Keep only the record",
        "The lab kept whole runs, ids and all.",
        "Keep only a run's record, with ids stripped.",
        "A closed run leaves its record and nothing else.",
      ),
      it(
        "Survive a restart",
        "Notices were lost on restart and a bad surface took the root.",
        "Keep notices on disk; list a surface that does not load as broken.",
        "The root stays up when a surface does not load.",
      ),
    ],
  },
  {
    n: 30,
    title: "Build the Design Document surface",
    status: "done",
    narrative: "told",
    from: [10],
    iterations: [
      it(
        "Scenarios on a demo",
        "Refining the told content needed something free and repeatable.",
        "Scenarios on a demo project that show every text an agent is given.",
        "Eight findings recorded.",
      ),
    ],
  },
  {
    n: 26,
    title: "Refine what the agent is given, second iteration",
    status: "draft",
    narrative: "told",
    from: [30, 10],
    iterations: [
      it("Findings from the lab", "Issue 10's runs showed two misreads by Haiku.", "Collect them as findings before rewording.", "Two findings wait."),
      it(
        "Findings from the Design Document",
        "The skill dominates what is given, and some things are told twice.",
        "Wait for the person to choose what to cut.",
        "Waits for the person.",
      ),
    ],
  },
  {
    n: 31,
    title: "Render a surface's structure as its menu header",
    status: "done",
    narrative: "shell",
    from: [24],
    iterations: [
      it(
        "A surface is a tree",
        "Every page built its own menus.",
        "Draw the header from the surface's views, already a tree.",
        "A first header made from views.",
      ),
      it(
        "Search and drawers",
        "Long lists did not fit and inputs had nowhere to go.",
        "Search for long lists and Help, drawers for inputs.",
        "Every action is reachable from the header.",
      ),
      it(
        "The shell's alone",
        "Pages still added their own entries.",
        "The header became the shell's alone; page-private entries moved into content.",
        "Every surface has the same bar.",
      ),
    ],
  },
  { n: 32, title: "Make the + a home tab with the command palette", status: "done", narrative: "shell", from: [18], iterations: [] },
  {
    n: 33,
    title: "Move the strip to the top, the surface's menu under it",
    status: "done",
    narrative: "shell",
    from: [31, 32],
    iterations: [
      it(
        "Two levels",
        "The strip at the bottom and the menu at the top split the eye.",
        "Two levels of header: the strip, then the menu.",
        "The page reads top down.",
      ),
      it("Hide the second level", "The menu takes room the content wants.", "The person can hide it for every tab.", "Content can fill the tab."),
    ],
  },
  { n: 25, title: "Design a config layer for how baba provisions each harness", status: "backlog", narrative: "lab", from: [27], iterations: [] },
  {
    n: 34,
    title: "Experiment: a map of the work as a graph of issues",
    status: "lane",
    narrative: "queue",
    from: [9, 26],
    iterations: [
      it(
        "A prototype map",
        "The queue shows issues, not the efforts and how they branch.",
        "Build a map surface as a prototype to judge by look and feel.",
        "",
      ),
    ],
  },
]
