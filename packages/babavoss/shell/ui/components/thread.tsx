// A thread: what passed in a session, in order, on one rhythm. Messages are what is read; everything an agent did
// between them is steps, each a line that opens onto its detail, or gathered under one line that says how much. Where a
// turn ends, its figures sit quietly under it; what happened to the session itself is a quiet line in the middle. Every
// fold follows the thread's "all" until it is toggled.
import * as React from "react"
import { cn } from "cn"

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./message-scroller"
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "./trace"

/** Every fold open or closed at once: `all` is what they follow, `epoch` counts the times it was said. */
export type ThreadDetail = { all?: boolean; epoch: number }

const Detail = React.createContext<ThreadDetail>({ epoch: 0 })

/** A fold's state: its own once toggled, until the next "all"; before that, what "all" says, or `initial`. */
function useThreadFold(initial = false) {
  const { all, epoch } = React.useContext(Detail)
  const [own, setOwn] = React.useState<{ epoch: number; open: boolean }>()
  const open = own && own.epoch === epoch ? own.open : (all ?? initial)

  return [open, (next: boolean) => setOwn({ epoch, open: next })] as const
}

/** The state a toolbar's expand-all button keeps, and its toggle; give `detail` to the Thread. */
function useThreadDetail() {
  const [detail, setDetail] = React.useState<ThreadDetail>({ epoch: 0 })

  return { detail, expanded: !!detail.all, toggle: () => setDetail((d) => ({ all: !d.all, epoch: d.epoch + 1 })) }
}

/** The thread's column: it scrolls itself and follows its tail unless scrolled up. Items sit 12px apart; `detail` is the expand-all state. */
function Thread({ detail, className, children }: { detail?: ThreadDetail; className?: string; children: React.ReactNode }) {
  const inherited = React.useContext(Detail)

  return (
    <Detail.Provider value={detail ?? inherited}>
      <MessageScrollerProvider autoScroll>
        <MessageScroller data-slot="thread" className={cn("min-h-0 flex-1", className)}>
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-3 px-3 py-3">{children}</MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    </Detail.Provider>
  )
}

/** One item of the thread, by a stable `id`. `end` puts it at the far side, where the user side speaks, no wider than most of the column. */
function ThreadItem({ id, end, title, className, children }: { id: string; end?: boolean; title?: string; className?: string; children: React.ReactNode }) {
  return (
    <MessageScrollerItem messageId={id}>
      <div data-slot="thread-item" title={title} className={cn("flex min-w-0 flex-col", end && "items-end *:max-w-[85%]", className)}>
        {children}
      </div>
    </MessageScrollerItem>
  )
}

const TONE = {
  accent: "[&>[data-slot=trace-icon]]:text-primary [&>[data-slot=trace-title]]:text-foreground",
  user: "[&>[data-slot=trace-icon]]:text-thread-user [&>[data-slot=trace-title]]:text-thread-user",
  context: "[&>[data-slot=trace-icon]]:text-thread-context [&>[data-slot=trace-title]]:text-thread-context",
}

/**
 * A line that opens onto its detail: an icon, a title, a quieter description cut to the line, an aside at its end.
 * Without children it is only the line. `status` marks it running or failed. `tone` tells whose it is where that
 * matters: `accent` one of particular concern, such as what an app did among an agent's steps, its icon in the accent
 * and its title in full ink; `user` what the user side did beside its messages; `context` what was put into the
 * agent's context, such as a hook's output. Those two take their voice's colour.
 */
function ThreadStep({
  icon,
  title,
  description,
  aside,
  status,
  tone,
  initial,
  children,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  status?: "running" | "error"
  tone?: "accent" | "user" | "context"
  initial?: boolean
  children?: React.ReactNode
}) {
  const [open, setOpen] = useThreadFold(initial)
  const line = (
    <TraceLine status={status} className={tone && TONE[tone]}>
      {icon && <TraceIcon>{icon}</TraceIcon>}
      <TraceTitle className="shrink-0">{title}</TraceTitle>
      {description !== undefined && <TraceDescription className="min-w-0 shrink truncate">{description}</TraceDescription>}
      {aside !== undefined && <TraceDescription className="shrink-0 tabular-nums">{aside}</TraceDescription>}
    </TraceLine>
  )

  if (children === undefined || children === null || children === false || children === "") return <Trace data-slot="thread-step">{line}</Trace>

  return (
    <Trace data-slot="thread-step">
      <TraceCollapsible open={open} onOpenChange={setOpen}>
        <TraceCollapsibleTrigger className="max-w-full">{line}</TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="flex flex-col gap-1.5 pt-1 pb-0.5">{children}</TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

/**
 * The steps between two messages under one line: `summary` says how much was done, the steps show on opening. Open by
 * itself while `running`, closed once done, unless the person or "all" said otherwise.
 */
function ThreadSteps({
  icon,
  summary,
  description,
  aside,
  running,
  error,
  children,
}: {
  icon?: React.ReactNode
  summary: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  running?: boolean
  error?: boolean
  children: React.ReactNode
}) {
  return (
    <ThreadStep
      icon={icon}
      title={summary}
      description={description}
      aside={aside}
      status={running ? "running" : error ? "error" : undefined}
      initial={running}
    >
      {children}
    </ThreadStep>
  )
}

/** Where a turn ended: what it took and cost, quiet at the far end under what it ends; the rest in `title`. */
function ThreadEnd({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div data-slot="thread-end" title={title} className="flex h-4 justify-end text-[0.6875rem] leading-4 text-muted-foreground/70 tabular-nums">
      {children}
    </div>
  )
}

/**
 * Something that happened to the session rather than in its conversation, such as a restart, a resume or another
 * model from here on: one quiet line in the middle of the thread, its icon before it.
 */
function ThreadEvent({ icon, title, children }: { icon?: React.ReactNode; title?: string; children: React.ReactNode }) {
  return (
    <div
      data-slot="thread-event"
      title={title}
      className="flex min-w-0 items-center justify-center gap-1.5 text-[0.6875rem] leading-4 text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0"
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </div>
  )
}

export { Thread, ThreadEnd, ThreadEvent, ThreadItem, ThreadStep, ThreadSteps, useThreadDetail }
