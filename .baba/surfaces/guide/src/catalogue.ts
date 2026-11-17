// The guide's catalogue: every specimen, once, in the group and section it belongs to, with the framework's files it shows
// and the states it is shown in. Pure data, which the surface lists and the page draws; a specimen's path is
// /GROUP/ENTRY. A file of the kit's components or layouts that no entry names fails the guide's spec.
import { PRESETS } from "babavoss/kit/theme.ts"
import { MOVES } from "babavoss/shell/ui/gaze.ts"

export type Entry = { readonly id: string; readonly title: string; readonly files: readonly string[]; readonly states: readonly string[] }
export type Section = { readonly title: string; readonly entries: readonly Entry[] }
export type Group = { readonly id: string; readonly title: string; readonly about: string; readonly sections: readonly Section[] }

const KIT = "framework/kit"
const SHELL = "framework/shell/ui"
const C = (name: string) => `${KIT}/components/${name}.tsx`
const L = (name: string) => `${KIT}/layouts/${name}`
const PRESET_IDS = PRESETS.map((p) => p.id)

export const GROUPS = [
  {
    id: "mark",
    title: "Mark",
    about: "The two eyes: home's tab and whose move it is",
    sections: [
      {
        title: "Mark",
        entries: [
          {
            id: "states",
            title: "States",
            files: [`${SHELL}/mark.tsx`, `${SHELL}/turn.ts`, `${SHELL}/rail.ts`],
            states: ["still", "working", "working, animation off", "waiting", "lost", "hooks not heard"],
          },
          { id: "moves", title: "Moves", files: [`${SHELL}/gaze.ts`], states: ["any", ...MOVES.map((m) => m.name)] },
          { id: "sphere", title: "Sphere", files: [`${SHELL}/gaze.ts`], states: ["still", "any", ...MOVES.map((m) => m.name), "following the pointer"] },
        ],
      },
    ],
  },
  {
    id: "foundations",
    title: "Foundations",
    about: "The tokens every page is drawn with",
    sections: [
      {
        title: "Tokens",
        entries: [
          { id: "colour", title: "Colour", files: [`${KIT}/theme.ts`, `${KIT}/theme.css`, `${KIT}/defaults.css`], states: PRESET_IDS.flatMap((id) => [`${id} light`, `${id} dark`]) },
          { id: "type", title: "Type", files: [`${KIT}/defaults.css`], states: ["badge", "meta", "body", "large", "sm", "base", "lg", "xl", "sans", "mono"] },
          { id: "radius", title: "Radius", files: [`${KIT}/defaults.css`], states: ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"] },
          { id: "frame", title: "Frame", files: [`${KIT}/defaults.css`], states: ["menubar", "bar", "row", "icon", "rail-icon", "glyph"] },
        ],
      },
    ],
  },
  {
    id: "primitives",
    title: "Primitives",
    about: "The kit's components, and the parts of a content it has an opinion on",
    sections: [
      {
        title: "Actions",
        entries: [
          { id: "button", title: "Button", files: [C("button")], states: ["default", "outline", "secondary", "ghost", "destructive", "link", "sizes", "icon", "disabled"] },
          { id: "toggle", title: "Toggle", files: [C("toggle"), C("toggle-group")], states: ["off", "on", "outline", "sm", "group", "disabled"] },
        ],
      },
      {
        title: "Inputs",
        entries: [
          { id: "input", title: "Input", files: [C("input"), C("textarea")], states: ["empty", "filled", "invalid", "disabled", "textarea"] },
          { id: "theme-picker", title: "Theme picker", files: [C("theme-picker"), `${KIT}/theme.ts`], states: ["live", "light and dark", "disabled"] },
        ],
      },
      {
        title: "Feedback",
        entries: [
          { id: "badge", title: "Badge", files: [C("badge")], states: ["default", "secondary", "destructive", "outline", "ghost", "link"] },
          { id: "alert", title: "Alert", files: [C("alert")], states: ["default", "destructive", "action"] },
          { id: "empty", title: "Empty", files: [C("empty")], states: ["text", "icon", "content"] },
        ],
      },
      {
        title: "Overlays",
        entries: [
          { id: "tooltip", title: "Tooltip", files: [C("tooltip")], states: ["hover"] },
          { id: "popover", title: "Popover", files: [C("popover")], states: ["open"] },
          { id: "dropdown-menu", title: "Dropdown menu", files: [C("dropdown-menu")], states: ["items", "check", "radio", "submenu", "shortcut", "destructive"] },
          { id: "dialog", title: "Dialog", files: [C("dialog")], states: ["open"] },
        ],
      },
      {
        title: "Layout",
        entries: [
          { id: "resizable", title: "Resizable", files: [C("resizable")], states: ["horizontal", "handle"] },
          { id: "toolbar", title: "Toolbar", files: [L("parts.tsx")], states: ["toolbar", "spacer", "segments"] },
          { id: "page", title: "Page", files: [L("parts.tsx")], states: ["page", "empty", "narrow"] },
        ],
      },
    ],
  },
  {
    id: "shell",
    title: "Shell",
    about: "What the shell draws around every surface",
    sections: [
      {
        title: "Rail",
        entries: [
          { id: "rail", title: "Rail", files: [`${SHELL}/rail.tsx`, `${SHELL}/rail.ts`, `${SHELL}/tab-scroll.ts`], states: ["left", "right", "top", "bottom", "marks", "long title", "dots"] },
          { id: "bubble", title: "Bubble", files: [`${SHELL}/bubbles.tsx`], states: ["right", "left", "down", "up", "from"] },
        ],
      },
      {
        title: "Drawer",
        entries: [
          { id: "drawer", title: "Drawer", files: [`${SHELL}/drawer.tsx`, `${SHELL}/island.tsx`, `${SHELL}/actions.tsx`, `${SHELL}/commands.ts`, L("menu.tsx")], states: ["a tab's", "home's", "home's, hooks not heard", "broken", "menu", "search", "pinned"] },
          { id: "entries", title: "Entries", files: [`${SHELL}/thread.ts`, `${SHELL}/drawer.tsx`], states: ["notice", "calls", "tab entry", "on home"] },
          { id: "inputs", title: "Input modal", files: [`${SHELL}/inputs.tsx`], states: ["form", "refused"] },
        ],
      },
      {
        title: "Home",
        entries: [{ id: "desktop", title: "Desktop", files: [`${SHELL}/home.tsx`, `${SHELL}/home.ts`], states: ["open", "tabs", "marked", "broken", "foot"] }],
      },
      {
        title: "Standing",
        entries: [
          { id: "connection", title: "Connection", files: [`${SHELL}/connection.tsx`], states: ["connecting", "reconnecting", "refused", "pointed"] },
          { id: "tab-states", title: "Tab states", files: [`${SHELL}/tabs.tsx`, `${SHELL}/actions.tsx`], states: ["refused", "broken", "failed", "no page"] },
        ],
      },
    ],
  },
] as const satisfies readonly Group[]

/** A specimen's path within the guide, which names it: "primitives/button". */
export type Path = { [G in (typeof GROUPS)[number] as G["id"]]: `${G["id"]}/${G["sections"][number]["entries"][number]["id"]}` }[(typeof GROUPS)[number]["id"]]

export const entries = (): { group: Group; section: Section; entry: Entry; path: Path }[] =>
  GROUPS.flatMap((group: Group) => group.sections.flatMap((section) => section.entries.map((entry) => ({ group, section, entry, path: `${group.id}/${entry.id}` as Path }))))

/** A group's id, and the ids of its entries: what the page draws, one specimen each, checked when types are. */
export type GroupId = (typeof GROUPS)[number]["id"]
export type EntryOf<G extends GroupId> = Extract<(typeof GROUPS)[number], { id: G }>["sections"][number]["entries"][number]["id"]
