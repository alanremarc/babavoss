// The guide's page: the groups and their specimens down the left, the one group shown at the right, each specimen the
// framework's real component drawn with sample data in its states. Where the page is, the group and the specimen, is the
// tab's route, /GROUP/ENTRY, so the agent's pointing and a refresh land on it; scrolling marks the specimen in view on
// the left without moving the route. What each specimen draws is in the group's own module.
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react"
import { SwatchBookIcon } from "lucide-react"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"
import type { EntryOf, GroupId } from "../src/catalogue.ts"
import { Specimen } from "./frame.tsx"
import { foundations } from "./foundations.tsx"
import { layouts } from "./layouts.tsx"
import { mark } from "./mark.tsx"
import { primitives } from "./primitives.tsx"
import { shell } from "./shell.tsx"

export const icon = <SwatchBookIcon aria-hidden />

/** What each specimen draws, by group and entry: every entry of the catalogue has one. */
const DRAWN: { [G in GroupId]: Record<EntryOf<G>, ComponentType> } = { mark, foundations, primitives, layouts, shell }

type Row = { at: string; title: string; states: string[] }
type Root = { groups: { at: string; title: string; about: string; specimens: number }[]; specimens: Row[] }
type Shown = { title: string; about: string; sections: { title: string; specimens: (Row & { files: string[] })[] }[] }

const idOf = (at: string) => `specimen${at.replaceAll("/", "-")}`

export default function Guide() {
  const { view: root } = useLive<Root>("/")
  const { route, navigate } = useTab()
  const [, named, entry] = route.split("/")
  const group = root!.groups.find((g) => g.at === `/${named}`) ?? root!.groups[0]!
  const { view: shown } = useLive<Shown>(group.at)
  const main = useRef<HTMLElement>(null)
  const [inView, setInView] = useState<string>()
  const draw = DRAWN[group.at.slice(1) as GroupId] as Record<string, ComponentType>

  // The route's specimen is brought into view; a group alone, its top. Again a moment later: a command list scrolls its
  // chosen item into view as it mounts, which would move the page.
  useLayoutEffect(() => {
    const place = () => {
      const target = entry ? document.getElementById(idOf(`${group.at}/${entry}`)) : null
      const box = main.current

      // The content scrolls, never the page around it, which the rail stands beside.
      if (box) box.scrollTop = target ? target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12 : 0
      document.scrollingElement?.scrollTo({ top: 0 })
    }
    const later = setTimeout(place, 80)

    place()

    return () => clearTimeout(later)
  }, [group.at, entry, shown])

  // The specimen nearest the top of the content is the one marked on the left.
  useEffect(() => {
    const sections = [...(main.current?.querySelectorAll<HTMLElement>("section[id^=specimen]") ?? [])]
    const seen = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (changes) => {
        for (const c of changes) seen.set(c.target.id, c.isIntersecting)
        setInView(sections.find((s) => seen.get(s.id))?.id)
      },
      { root: main.current, rootMargin: "0px 0px -60% 0px" }
    )

    for (const s of sections) observer.observe(s)

    return () => observer.disconnect()
  }, [shown])

  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="Specimens" className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar px-2 py-3">
        {root!.groups.map((g) => {
          const open = g.at === group.at

          return (
            <div key={g.at} className="flex flex-col">
              <button
                type="button"
                aria-current={open && !entry ? "page" : undefined}
                className={`flex h-row items-center justify-between rounded-md px-2 text-left outline-none hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-ring ${open ? "font-medium text-foreground" : "text-muted-foreground"}`}
                onClick={() => navigate(g.at)}
              >
                {g.title}
                <span className="text-meta font-normal text-muted-foreground/70 tabular-nums">{g.specimens}</span>
              </button>
              {open &&
                root!.specimens
                  .filter((s) => s.at.startsWith(`${g.at}/`))
                  .map((s) => (
                    <button
                      key={s.at}
                      type="button"
                      aria-current={idOf(s.at) === inView ? "true" : undefined}
                      className="flex h-row items-center rounded-md pr-2 pl-4 text-left text-muted-foreground outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current]:bg-foreground/8 aria-[current]:text-foreground"
                      onClick={() => navigate(s.at)}
                    >
                      <span className="truncate">{s.title}</span>
                    </button>
                  ))}
            </div>
          )
        })}
      </nav>
      <main ref={main} className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 pt-4 pb-24">
          <header className="flex items-baseline gap-3">
            <h1 className="text-sm font-semibold">{shown?.title}</h1>
            <p className="text-muted-foreground">{shown?.about}</p>
          </header>
          {shown?.sections.map((section) => (
            <div key={section.title} className="flex flex-col gap-4">
              {shown.sections.length > 1 && <h2 className="text-meta font-medium tracking-wide text-muted-foreground uppercase">{section.title}</h2>}
              {section.specimens.map((s) => {
                const Drawn = draw[s.at.split("/")[2]!]

                return (
                  <Specimen key={s.at} id={idOf(s.at)} title={s.title} files={s.files}>
                    {Drawn ? <Drawn /> : null}
                  </Specimen>
                )
              })}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
