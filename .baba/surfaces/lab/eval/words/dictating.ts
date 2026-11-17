// The fixture's words as they were before a surface said mechanics alone: a `how` and descriptions that tell the agent
// when to act, how to run its work and who decides. A variant run with `--variant PATH#dictating` takes these in place of
// the fixture's own (fixture/queue/src/words.ts), to compare what the agent does under each. It is copied over that file in
// a run's project, so it imports nothing; the eval's spec keeps its shape the same.
export const LANES = 5

export const words = {
  description:
    "Track the session's work as issues, each in the backlog, in a lane or done, on a narrative with what it came out of. " +
    "Use when work is asked for, starts, moves, branches or lands.",
  how:
    "The session's work as the person follows it, so it is worth keeping true as the work moves. What the person asks for is added " +
    "as an issue; what you would suggest is a draft, theirs to look at. Once they say to go ahead with a draft, on the page or in " +
    "the conversation, it is as good as approved: start it like any issue. A lane is a subagent delivering one issue; a note says " +
    "where an issue stands. Done means merged into main. add_from also names what an issue came out of and its narrative, an effort " +
    `going its own way. An issue's path has the rest. There are ${LANES} lanes; the backlog's top is next.`,
  actions: {
    add: "one the person asked for, to the backlog's bottom; title short and imperative, about on what changes and why",
    add_from: "as add, with the issues it came out of, a comma list, or none; narrative empty for its first parent's",
    draft: "an issue the person has not asked for, theirs to look at, on the page or with you",
    approve: "into the backlog: the person does on the page, and you once they say to go ahead",
    describe: "",
    note: "what is being done or waited for; empty clears it",
    start: "when a subagent begins on it, a draft the person said to build too",
    done: "its work is merged into main",
    back: "to the backlog",
    drop: "it will not be done",
    link: "it came out of that one as well",
    unlink: "it did not come out of that one",
    move: "to another narrative",
  },
}
