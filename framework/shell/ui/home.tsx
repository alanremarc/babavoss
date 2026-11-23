// Home: what a click on the mark shows, and the page where no tab is. By default a desktop: an icon a surface with its name,
// Open or how many tabs under it, marked where a tab of it is broken or holds a highlight; a click goes to its newest tab, or opens one.
// A surface that does not load is shown faint, and says why on hover. A project may draw its own home, `.baba/home.tsx`,
// given the same (HomeProps in home.ts). At the desktop's foot, and given to a project's home to place, one muted line:
// the root and its version, the session, the harness, and a later release where one is out.
import { useEffect, useState, type ReactNode } from "react"
import { BoxIcon } from "lucide-react"
import { cn } from "../../kit/cn.ts"
import { iconsOf, openOf, type HomeProps } from "./home.ts"
import { MARK } from "./rail.ts"

/** The desktop, home where the project draws none of its own. */
export function Desktop({ title, notice, surfaces, tabs, foot }: HomeProps) {
  return (
    <section aria-label="Home" className="flex min-h-0 flex-1 flex-col overflow-auto p-8 pb-3 text-body">
      <h1 className="sr-only">{title}</h1>
      {notice && <p className="mb-6 max-w-xl text-muted-foreground">{notice}</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,96px)] content-start gap-x-4 gap-y-6">
        {iconsOf(surfaces, tabs).map(({ surface, tabs: mine, mark }) => {
          const under = surface.broken !== undefined ? "Does not load" : openOf(mine.length)
          const click = mine[0]?.go ?? surface.open

          return (
            <li key={surface.name}>
              <button
                type="button"
                title={surface.broken ?? surface.description}
                disabled={!click}
                data-surface-icon={surface.name}
                className="group/icon flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl p-2 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                onClick={click}
              >
                <span className="relative grid size-14 place-items-center rounded-2xl bg-foreground/6 text-foreground ring-1 ring-foreground/8 group-hover/icon:bg-foreground/9 [&_svg]:size-6">
                  {surface.icon ?? <BoxIcon aria-hidden />}
                  {mark && <span aria-hidden data-mark={mark} className={cn("absolute -top-0.5 -right-0.5 rounded-full ring-2 ring-background", MARK[mark])} />}
                </span>
                <span className="max-w-full truncate text-foreground">{surface.label}</span>
                <span className={cn("-mt-1.5 min-h-4 text-meta", surface.broken !== undefined ? "text-destructive" : "text-muted-foreground")}>{under ?? " "}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-auto pt-6">{foot}</div>
    </section>
  )
}

/** Whose page this is, from the meta tags the runtime serves the page with; presentation, never in a view. */
const about = (key: string): string | undefined => (typeof document === "undefined" ? undefined : document.querySelector<HTMLMetaElement>(`meta[name="babavoss:${key}"]`)?.content || undefined)

/** A harness as the person knows it, by its adapter's name; one not known here is said by that name. */
const HARNESSES: Record<string, string> = { claude: "Claude Code", codex: "Codex", antigravity: "Antigravity" }

/** The facts home's foot says, read once from the page's head. */
export const factsOf = () => ({ root: about("root"), version: about("version"), session: about("session"), update: about("update") })

/**
 * Home's foot, one muted line: the root and its version, then the session shortened, whole on hover and copied on a
 * click, and its harness once a hook said it; and a later release, where one is out.
 */
export function Foot({ harness, className, facts: given }: { harness?: string; className?: string; facts?: ReturnType<typeof factsOf> }): ReactNode {
  const [facts] = useState(() => given ?? factsOf())
  const [copied, setCopied] = useState(false)
  const { root, version, session, update } = facts

  useEffect(() => {
    if (!copied) return

    const timer = setTimeout(() => setCopied(false), 1500)

    return () => clearTimeout(timer)
  }, [copied])

  if (!root && !session) return null

  return (
    <footer className={cn("flex w-full flex-wrap justify-center gap-x-3 px-2 text-meta text-muted-foreground", className)}>
      {root && <span className="truncate">{version ? `${root} ${version}` : root}</span>}
      {session && (
        <button
          type="button"
          title={session}
          aria-label={`Copy session id ${session}`}
          className="cursor-pointer rounded-sm whitespace-nowrap hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          onClick={() => void navigator.clipboard?.writeText(session).then(() => setCopied(true))}
        >
          {copied ? "Copied" : `session ${session.slice(0, 8)}`}
        </button>
      )}
      {harness && (
        <span className="whitespace-nowrap" title="The harness this session's agent runs in, as its hooks say">
          {HARNESSES[harness] ?? harness}
        </span>
      )}
      {update && (
        <span className="truncate" title={`babavoss ${update} is out; the agent is told how to take it`}>
          babavoss {update} is out: ask the agent to update
        </span>
      )}
    </footer>
  )
}
