// The design guide: the UI the framework is built with, drawn live on the page from the framework's own code with sample
// data, so the person sees it and iterates on it. Nothing here changes: the guide is the catalogue (catalogue.ts), its
// groups at /, each group's specimens at /GROUP, a specimen at /GROUP/ENTRY. The agent reads where a thing is and brings
// it to the front of the person's page with the shell's highlight; the page follows the code as it changes.
import { detail, surface, view } from "babavoss/core/index.ts"
import { entries, GROUPS, type Entry, type Group } from "./catalogue.ts"

type Model = Record<string, never>

/** A specimen as a group lists it: where it is, its name and the states it is shown in. */
const row = (group: Group, entry: Entry) => ({ at: `/${group.id}/${entry.id}`, title: entry.title, states: [...entry.states] })

const pages = view<Model, never>([], {
  "/": () => ({
    title: "Design Guide",
    how:
      "Each specimen is the framework's real component drawn with sample data, in its states, at /GROUP/ENTRY, where a highlight shows it to " +
      "the person. A specimen names the framework's files it is drawn from: a change to them is what changes it, and the guide follows.",
    groups: GROUPS.map((group: Group) => ({ at: `/${group.id}`, title: group.title, about: group.about, specimens: group.sections.reduce((n, s) => n + s.entries.length, 0) })),
    specimens: detail(entries().map(({ group, entry }) => row(group, entry))),
  }),
  "/:group": (_, { group: id }) => {
    const group = GROUPS.find((g: Group) => g.id === id) as Group | undefined

    return (
      group && {
        title: group.title,
        about: group.about,
        sections: group.sections.map((s) => ({ title: s.title, specimens: s.entries.map((e) => ({ ...row(group, e), files: [...e.files] })) })),
      }
    )
  },
  "/:group/:entry": (_, { group: g, entry: e }) => {
    const found = entries().find(({ group, entry }) => group.id === g && entry.id === e)

    return found && { title: found.entry.title, group: { at: `/${found.group.id}`, title: found.group.title }, section: found.section.title, files: [...found.entry.files], states: [...found.entry.states] }
  },
})

export default surface<Model, never, never>({
  description: "See the UI babavoss is built with, live: the mark, the design tokens, the kit's primitives and the shell's elements, each in its states. Use when how a piece of it looks is shown or changed.",
  init: () => ({}),
  update: (m) => ({ model: m }),
  view: pages.view,
  run: async () => {},
  failed: () => {
    throw new Error("the guide runs no commands")
  },
})
