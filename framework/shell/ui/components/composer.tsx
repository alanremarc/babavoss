// The composer: where the person writes to an agent. A message, sent on Enter; what can be called by name completes as
// it is typed, from the first character; what the session runs under sits in the footer, quiet.
import * as React from "react"
import { SendHorizontalIcon, SquareIcon } from "lucide-react"
import { cn } from "cn"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "./input-group"

/** Something to call by name: `insert` is the text it becomes, its first character what starts the completion. */
export type ComposerCompletion = { id: string; label: string; description?: string; insert: string }

/**
 * `send` takes the text and answers with why it was refused, or nothing once it is taken, which clears the field.
 * `closed` says why nothing can be sent now, in place of the placeholder; `reopen`, where given, is what opens it again,
 * a button in place of Send, such as resuming a session that stopped. `completions` are offered while the text is
 * one word that starts as one of them does: Up and Down move, Enter or Tab takes one, Escape puts the list away.
 */
function Composer({
  label = "Prompt",
  placeholder,
  closed,
  send,
  stop,
  reopen,
  completions = [],
  footer,
  className,
}: {
  label?: string
  placeholder?: string
  closed?: string
  send?: (text: string) => Promise<string | undefined>
  stop?: () => void
  reopen?: { label: string; title?: string; run: () => void }
  completions?: ComposerCompletion[]
  footer?: React.ReactNode
  className?: string
}) {
  const [text, setText] = React.useState("")
  const [refused, setRefused] = React.useState<string>()
  const [at, setAt] = React.useState(0)
  const [away, setAway] = React.useState<string>()
  const listId = React.useId()
  const field = React.useRef<HTMLTextAreaElement>(null)
  const starts = new Set(completions.map((c) => c.insert[0]))
  const word = !/\s/.test(text) && starts.has(text[0]) ? text.slice(1).toLowerCase() : undefined
  const offered =
    word === undefined || away === text
      ? []
      : completions.filter((c) => c.insert[0] === text[0] && (c.label.toLowerCase().includes(word) || c.insert.toLowerCase().includes(word))).slice(0, 12)
  const current = Math.min(at, offered.length - 1)
  const take = (c: ComposerCompletion) => {
    setText(c.insert)
    setAt(0)
    field.current?.focus()
  }
  const submit = async () => {
    if (!send || !text.trim()) return

    const reason = await send(text)

    setRefused(reason)
    if (reason === undefined) setText("")
  }

  return (
    <form
      data-slot="composer"
      className={cn("relative flex shrink-0 flex-col gap-1 border-t p-2", className)}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {offered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Completions"
          className="absolute inset-x-2 bottom-full z-20 mb-1 flex max-h-64 flex-col overflow-y-auto rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {offered.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              className={cn(
                "grid cursor-default grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-x-3 rounded-sm px-2 py-1",
                i === current && "bg-foreground/10"
              )}
              onMouseEnter={() => setAt(i)}
              onMouseDown={(event) => {
                event.preventDefault()
                take(c)
              }}
            >
              <span className="truncate font-mono">{c.label}</span>
              <span className="truncate text-[0.6875rem] leading-4 text-muted-foreground">{c.description}</span>
            </li>
          ))}
        </ul>
      )}
      {refused && (
        <p role="alert" className="px-1 text-[0.6875rem] leading-4 text-destructive">
          {refused}
        </p>
      )}
      <InputGroup>
        <InputGroupTextarea
          ref={field}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setAt(0)
          }}
          placeholder={send ? placeholder : (closed ?? placeholder)}
          disabled={!send}
          aria-label={label}
          aria-controls={offered.length ? listId : undefined}
          aria-activedescendant={offered.length ? `${listId}-${current}` : undefined}
          rows={2}
          onKeyDown={(event) => {
            if (offered.length) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                setAt((current + (event.key === "ArrowDown" ? 1 : offered.length - 1)) % offered.length)

                return
              }
              if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                event.preventDefault()
                take(offered[current]!)

                return
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setAway(text)

                return
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <InputGroupAddon align="block-end">
          {footer !== undefined && <span className="flex min-w-0 items-center gap-1 truncate text-[0.6875rem] leading-4 text-muted-foreground">{footer}</span>}
          {stop && (
            <InputGroupButton type="button" variant="ghost" aria-label="Stop" title="Stop the agent" className="ms-auto" onClick={stop}>
              <SquareIcon />
            </InputGroupButton>
          )}
          {!send && reopen ? (
            <InputGroupButton type="button" variant="default" title={reopen.title} className={stop ? "" : "ms-auto"} onClick={reopen.run}>
              {reopen.label}
            </InputGroupButton>
          ) : (
            <InputGroupButton type="submit" variant="default" aria-label="Send" className={stop ? "" : "ms-auto"} disabled={!send || !text.trim()}>
              <SendHorizontalIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

export { Composer }
