// The demo's page: the notes as the person sees them. It reads the surface's views, calls its handles and follows its
// changes through the door; nothing here is state the agent should know, that is the surface's.
import { useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { BellIcon, BellRingIcon, CheckIcon, PlusIcon, StickyNoteIcon, Trash2Icon } from "lucide-react"
import type { Handle } from "babavoss/core/index.ts"
import { Button, call, changes, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, read } from "babavoss/shell/ui/index.ts"
import "./styles.css"

type Note = { at: string; n: number; text: string; due?: "pending" | "due"; remove: Handle; remind?: Handle }
type Root = { notes: { count: number; at: string }; latest: string | null; due: number; add: Handle; clear?: Handle }
type Notes = { notes: Note[] }

const muted = "text-muted-foreground"

/** The view at a path now and after every change the surface announces. */
function useView<V>(path: string): { view?: V; error?: string } {
  const [state, setState] = useState<{ view?: V; error?: string }>({})
  const load = useCallback(
    () =>
      read<V>(path).then(
        (view) => setState({ view }),
        (error: unknown) => setState((s) => ({ ...s, error: error instanceof Error ? error.message : String(error) }))
      ),
    [path]
  )

  useEffect(() => {
    void load()

    return changes(() => void load())
  }, [load])

  return state
}

function Add({ handle }: { handle: Handle }) {
  const [text, setText] = useState("")
  const [refused, setRefused] = useState<string>()

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={async (event) => {
        event.preventDefault()

        const answer = await call("/", handle.name, { ...handle.args, text })

        if (answer.outcome === "written") {
          setText("")
          setRefused(undefined)
        } else setRefused(answer.reason)
      }}
    >
      <div className="flex gap-1.5">
        <input
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A note to keep"
          aria-label="Note"
        />
        <Button type="submit" size="sm" disabled={!text.trim()}>
          <PlusIcon data-icon="inline-start" />
          Keep
        </Button>
      </div>
      {refused && <p className="text-[11px] text-destructive">{refused}</p>}
    </form>
  )
}

function Row({ note }: { note: Note }) {
  const [seconds, setSeconds] = useState("60")
  const tone = note.due === "due" ? "bg-primary/15 text-primary" : note.due === "pending" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`grid size-6 shrink-0 place-items-center rounded-full ${tone}`}>
          {note.due === "due" ? (
            <BellRingIcon className="size-3.5" />
          ) : note.due === "pending" ? (
            <BellIcon className="size-3.5" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px]">{note.text}</span>
          <span className={`block text-[11px] ${muted}`}>
            note {note.n}
            {note.due === "due" ? " · due now" : note.due === "pending" ? " · reminder set" : ""}
          </span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Forget note ${note.n}`}
          title={note.remove.description}
          onClick={() => void call(note.at, note.remove.name, note.remove.args)}
        >
          <Trash2Icon />
        </Button>
      </div>
      {note.remind && (
        <form
          className="flex items-center gap-1.5 ps-8"
          onSubmit={(event) => {
            event.preventDefault()
            void call(note.at, note.remind!.name, { ...note.remind!.args, seconds: Number(seconds) || 0 })
          }}
        >
          <span className={`text-[11px] ${muted}`}>Remind in</span>
          <input
            className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-right text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            aria-label={`Seconds until note ${note.n} is due`}
          />
          <span className={`text-[11px] ${muted}`}>s</span>
          <Button type="submit" size="sm" variant="outline" title={note.remind.description}>
            <BellIcon data-icon="inline-start" />
            Remind
          </Button>
        </form>
      )}
    </li>
  )
}

function Page() {
  const root = useView<Root>("/")
  const list = useView<Notes>("/notes")
  const [connected, setConnected] = useState(true)

  useEffect(() => changes(() => {}, setConnected), [])

  if (root.error && !root.view) return <p className={`p-6 ${muted}`}>{root.error}</p>
  if (!root.view) return null

  const notes = list.view?.notes ?? []

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          <StickyNoteIcon className="size-4" />
          Notes
        </h1>
        <p className={`text-[12px] ${muted}`}>
          {root.view.notes.count} kept{root.view.due ? ` · ${root.view.due} due` : ""}
          {!connected && " · reconnecting"}
        </p>
      </header>
      <Add handle={root.view.add} />
      {notes.length ? (
        <ul className="flex flex-col gap-1.5">
          {notes.map((note) => (
            <Row key={note.at} note={note} />
          ))}
        </ul>
      ) : (
        <Empty className="border border-dashed border-border/60 py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <StickyNoteIcon />
            </EmptyMedia>
            <EmptyTitle>No notes yet</EmptyTitle>
            <EmptyDescription>Keep one above, or ask the agent to.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {root.view.clear && (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="ghost" className={muted} onClick={() => void call("/", root.view!.clear!.name, root.view!.clear!.args)}>
            Forget every note
          </Button>
        </div>
      )}
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Page />)
