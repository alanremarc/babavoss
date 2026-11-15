// The frame: one bar the shell draws above every tab, the same for every surface. The tab's title; the menus its page
// gives, by useMenus or a layout's menu bar; the actions its surface offers the person where the tab is, by their own
// names, with what only the person may decide standing out; and room at the right for the shell's own marks. The page
// returns its content alone. Every menu entry and action is a command of the palette too, while the tab is the one looked at.
import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { XIcon } from "lucide-react"
import { Button } from "../../kit/components/button"
import { CommandGroup, CommandItem, CommandShortcut } from "../../kit/components/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../kit/components/dialog"
import { Input } from "../../kit/components/input"
import { Textarea } from "../../kit/components/textarea"
import { MenuHostContext, MenuTriggers, type Menu, type MenuHost, type MenuItem } from "../../kit/layouts/menu.tsx"
import type { Args, View } from "../../core/surface/view.ts"
import { actionItems, argsOf, commandsOf, joined, named, offered, type Command, type Offered } from "./commands.ts"
import { useTab } from "./tab.tsx"

/** Each frame's commands, by its tab's address, for the palette: a frame gives them while its tab is shown. */
export type Frames = {
  get: (at: string) => Command[] | undefined
  set: (at: string, commands: Command[] | undefined) => void
  subscribe: (fn: () => void) => () => void
}

export function useFrames(): Frames {
  const [frames] = useState<Frames>(() => {
    const all = new Map<string, Command[]>()
    const listeners = new Set<() => void>()

    return {
      get: (at) => all.get(at),
      set: (at, commands) => {
        if (commands) all.set(at, commands)
        else all.delete(at)
        for (const fn of listeners) fn()
      },
      subscribe: (fn) => {
        listeners.add(fn)

        return () => void listeners.delete(fn)
      },
    }
  })

  return frames
}

/** The view at a path under the tab as the agent reads it, the person's without the asks; by the header the door takes
 * the actor from, the core's ACTOR_HEADER, which lives with the service and so not in the page. */
async function asAgent(address: string, path: string): Promise<View | undefined> {
  const response = await fetch(address + (path === "/" ? "" : path), { headers: { accept: "application/json", "babavoss-actor": "agent" } })

  return response.ok ? ((await response.json()) as View) : undefined
}

/** The actions offered at a path under the tab, kept current; none where nothing is there, or with no path. */
function useOffered(path: string | undefined): Offered[] {
  const { live, address } = useTab()
  const [actions, setActions] = useState<Offered[]>([])

  useEffect(() => {
    let latest = 0

    if (path === undefined) return setActions([])

    return live(
      path,
      (view) => {
        const n = ++latest

        void asAgent(address, path).then(
          (agent) => n === latest && setActions(offered(path, view, agent)),
          () => n === latest && setActions(offered(path, view))
        )
      },
      () => setActions([])
    )
  }, [live, address, path])

  return actions
}

export function Frame({ frames, title, name, aside, children }: { frames: Frames; title?: string; name: string; aside?: ReactNode; children: ReactNode }) {
  const tab = useTab()
  const [given, setGiven] = useState<ReadonlyMap<string, MenuHost>>(new Map())
  const [prompting, setPrompting] = useState<Offered>()
  const [refused, setRefused] = useState("")
  const host = useCallback(
    (id: string, part: MenuHost | undefined) =>
      setGiven((was) => {
        const next = new Map(was)

        if (part) next.set(id, part)
        else next.delete(id)

        return next
      }),
    []
  )
  // Where the tab is, and its surface's root: a route that is no path of the surface offers nothing, and the root still does.
  const here = useOffered(tab.route === "/" ? undefined : tab.route)
  const root = useOffered("/")
  const actions = [...here, ...root]
  const parts = [...given.values()]
  const shown = title ?? parts.find((p) => p.label)?.label ?? named(name)
  const run = async (action: Offered, inputs: Args = {}) => {
    const answer = await tab.call(action.path, action.handle.name, { ...action.handle.args, ...inputs })

    setRefused(answer.outcome === "refused" ? answer.reason : "")

    return answer.outcome === "refused" ? answer.reason : undefined
  }
  const start = (action: Offered) => (Object.keys(action.handle.open).length ? setPrompting(action) : void run(action))
  const menus = joined(parts.map((p) => p.menus))
  // Where the tab is first, then the root's, a line between.
  const near = actionItems(here, start)
  const far = actionItems(root, start)
  const items = [...near, ...far]
  const entries: MenuItem[] = [
    ...near.map((c) => ({ kind: "action" as const, ...c })),
    ...(near.length && far.length ? [{ kind: "separator" as const, id: "root-edge" }] : []),
    ...far.map((c) => ({ kind: "action" as const, ...c })),
  ]
  const all: Menu[] = [...menus, ...(entries.length ? [{ id: "actions", label: "Actions", items: entries }] : [])]
  const asks = actions.filter((a) => a.ask)
  const commands: Command[] = [...items.map((c) => ({ ...c, group: shown })), ...commandsOf(menus)]

  // The palette's commands are this tab's while it is shown; a hidden tab's effects are gone, and so are its commands.
  useLayoutEffect(() => frames.set(tab.address, commands))
  useLayoutEffect(() => () => frames.set(tab.address, undefined), [frames, tab.address])

  return (
    <MenuHostContext.Provider value={host}>
      <div className="flex min-h-0 flex-1 flex-col text-body">
        <header aria-label={shown} data-frame className="flex h-menubar shrink-0 items-center gap-1 border-b bg-sidebar pr-1 pl-2.5">
          <h2 className="mr-1 max-w-[40%] shrink-0 truncate font-medium" title={shown}>
            {shown}
          </h2>
          <MenuTriggers menus={all} />
          <span className="min-w-2 flex-1" />
          {asks.slice(0, 3).map((a) => (
            <button
              key={`${a.path} ${a.handle.name} ${JSON.stringify(a.handle.args)}`}
              type="button"
              title={a.handle.description}
              className="flex h-row shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-primary/10 px-2 text-meta font-medium text-primary outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => start(a)}
            >
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              {named(a.handle.name)}
            </button>
          ))}
          {/* The shell's own marks for this tab go here. */}
          <div data-frame-aside className="flex shrink-0 items-center gap-1 empty:hidden">
            {aside}
          </div>
        </header>
        {refused && (
          <p role="alert" className="flex shrink-0 items-center gap-2 border-b bg-destructive/5 py-0.5 pr-1 pl-2.5 text-meta text-destructive">
            <span className="min-w-0 flex-1 truncate" title={refused}>
              {refused}
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              className="grid size-icon cursor-pointer place-items-center rounded-sm hover:bg-foreground/8"
              onClick={() => setRefused("")}
            >
              <XIcon className="size-glyph" aria-hidden />
            </button>
          </p>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      {prompting && <Prompt key={`${prompting.path} ${prompting.handle.name}`} action={prompting} run={run} close={() => setPrompting(undefined)} />}
    </MenuHostContext.Provider>
  )
}

/** The fields an action asks for before it runs, one per open input; Enter runs it, Shift+Enter breaks a line. */
function Prompt({ action, run, close }: { action: Offered; run: (action: Offered, inputs: Args) => Promise<string | undefined>; close: () => void }) {
  const [fields, setFields] = useState<Record<string, string | boolean>>({})
  const set = (field: string, value: string | boolean) => setFields((was) => ({ ...was, [field]: value }))
  const [refused, setRefused] = useState("")
  const [busy, setBusy] = useState(false)
  const args = argsOf(action.handle.open, fields)
  const submit = async () => {
    if (!args || busy) return
    setBusy(true)

    const reason = await run(action, args).finally(() => setBusy(false))

    if (reason === undefined) close()
    else setRefused(reason)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="text-body sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{named(action.handle.name)}</DialogTitle>
            <DialogDescription>{action.handle.description}</DialogDescription>
          </DialogHeader>
          {Object.entries(action.handle.open).map(([field, type], i) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-meta text-muted-foreground">{named(field)}</span>
              {type === "boolean" ? (
                <input type="checkbox" autoFocus={i === 0} checked={fields[field] === true} onChange={(e) => set(field, e.target.checked)} />
              ) : type === "number" ? (
                <Input type="number" autoFocus={i === 0} value={String(fields[field] ?? "")} onChange={(e) => set(field, e.target.value)} />
              ) : (
                <Textarea
                  rows={1}
                  autoFocus={i === 0}
                  className="max-h-48 min-h-0"
                  value={String(fields[field] ?? "")}
                  onChange={(e) => set(field, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return
                    e.preventDefault()
                    void submit()
                  }}
                />
              )}
            </label>
          ))}
          {refused && (
            <p role="alert" className="text-destructive">
              {refused}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!args || busy}>
              {named(action.handle.name)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The palette's first groups, the commands of the tab looked at: what waits on the person, then its actions and menus. */
export function TabCommands({ frames, at, done }: { frames: Frames; at: string; done: () => void }) {
  const commands = useSyncExternalStore(frames.subscribe, () => frames.get(at)) ?? []
  const rest = commands.filter((c) => !c.ask)
  const groups = [
    { heading: "For you to decide", list: commands.filter((c) => c.ask) },
    ...[...new Set(rest.map((c) => c.group))].map((heading) => ({ heading, list: rest.filter((c) => c.group === heading) })),
  ].filter((g) => g.list.length)
  // The palette closes first, so what a command opens, such as its prompt, is not taken down with it.
  const choose = (command: Command) => {
    done()
    requestAnimationFrame(command.run)
  }

  return groups.map((g) => (
    <CommandGroup key={g.heading} heading={g.heading}>
      {g.list.map((c) => (
        <CommandItem key={c.id} value={`command ${c.id}`} keywords={[c.label, c.hint ?? "", c.group]} disabled={c.disabled} onSelect={() => choose(c)}>
          <span className="grid size-[22px] shrink-0 place-items-center" aria-hidden>
            {c.ask && <span className="size-1.5 rounded-full bg-primary" />}
          </span>
          <span className="max-w-[45%] shrink-0 truncate text-foreground">{c.label}</span>
          {c.hint && c.hint !== c.label && (
            <span className="min-w-0 flex-1 truncate pl-1.5" title={c.hint}>
              {c.hint}
            </span>
          )}
          {c.keys && <CommandShortcut>{c.keys}</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  ))
}
