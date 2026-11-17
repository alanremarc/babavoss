// What an action asks of the person before it runs, in a modal over the page, wherever it was started, a tab's drawer or
// home's: the surface's own drawer for it, where its page exports one, or else a form the shell makes from the action's
// inputs, one field each by what the input is declared to be, the same declaration the agent reads, under its description. Both end in the same call; a refusal is shown in the modal with its
// reason and the modal stays open, and a call admitted closes it.
import { useState, type ComponentType, type ReactNode } from "react"
import { Button } from "../../kit/components/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../kit/components/dialog"
import { Input } from "../../kit/components/input"
import { Textarea } from "../../kit/components/textarea"
import { ToggleGroup, ToggleGroupItem } from "../../kit/components/toggle-group"
import { typeOf, type Args, type Handle, type Input as Declared, type View } from "../../core/surface/view.ts"
import { argsOf, named, type Offered } from "./commands.ts"

/**
 * What a drawer is given: the handle as offered, the path within the tab it is offered at, the view there now, `submit`,
 * which makes the call with the inputs and resolves with the reason where it is refused, and `close`, to give up.
 */
export type DrawerProps = { handle: Handle; path: string; view?: View; submit: (args: Args) => Promise<string | undefined>; close: () => void }
/** A page's drawers, by the name of the action each asks the inputs of: `export const drawers = { add: AddIssue }`. */
export type Drawers = Record<string, ComponentType<DrawerProps>>

/** `view` is the view where the action is offered, which a surface's drawer is given. */
export function Inputs({
  action,
  view,
  drawer: Drawer,
  call,
  close,
}: {
  action: Offered
  view?: View
  drawer?: ComponentType<DrawerProps>
  call: (action: Offered, args: Args) => Promise<string | undefined>
  close: () => void
}) {
  const [refused, setRefused] = useState("")
  const submit = async (args: Args) => {
    const reason = await call(action, args)

    if (reason === undefined) close()
    else setRefused(reason)

    return reason
  }
  const refusal = refused && (
    <p role="alert" className="text-destructive">
      {refused}
    </p>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className={`text-body ${Drawer ? "sm:max-w-2xl" : "sm:max-w-md"}`} {...(Drawer && { "aria-describedby": undefined })}>
        <DialogHeader>
          <DialogTitle>{named(action.handle.name)}</DialogTitle>
          {!Drawer && <DialogDescription>{action.handle.description}</DialogDescription>}
        </DialogHeader>
        {Drawer ? (
          <>
            <Drawer handle={action.handle} path={action.path} view={view} submit={submit} close={close} />
            {refusal}
          </>
        ) : (
          <Form action={action} submit={submit} close={close} refusal={refusal} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The most values a range is picked from as choices; a wider one is a number typed. */
const PICKED = 10

/** The values an input is picked from: its choices, or a narrow range's numbers; none where it is typed. */
const picked = (input: Declared): (string | number)[] | undefined => {
  if (typeof input === "string") return undefined
  if (input.choices?.length) return input.choices
  if (input.range && input.range[1] - input.range[0] < PICKED) return Array.from({ length: input.range[1] - input.range[0] + 1 }, (_, i) => input.range![0] + i)

  return undefined
}
const kindOf = (input: Declared) => (typeof input === "string" ? undefined : input.kind)

/**
 * One input's field, by what it is declared to be: a box to tick for a boolean; a picker of its choices, or of a narrow
 * range's numbers; a number, bounded by its range; markdown in a box of several lines, where Enter breaks a line and
 * ⌘ or Ctrl with Enter submits; any other text a line that grows, where Enter submits and Shift+Enter breaks a line.
 */
function Field({
  name,
  input,
  value,
  set,
  first,
  send,
}: {
  name: string
  input: Declared
  value: string | boolean | undefined
  set: (value: string | boolean) => void
  first: boolean
  send: () => void
}) {
  const choices = picked(input)
  const range = typeof input === "string" ? undefined : input.range

  if (typeOf(input) === "boolean") return <input type="checkbox" autoFocus={first} checked={value === true} onChange={(e) => set(e.target.checked)} />
  if (choices)
    return (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        className="flex-wrap"
        aria-label={name}
        value={String(value ?? "")}
        onValueChange={(v) => v && set(v)}
      >
        {choices.map((c, i) => (
          <ToggleGroupItem key={String(c)} value={String(c)} autoFocus={first && i === 0}>
            {String(c)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  if (typeOf(input) === "number")
    return <Input type="number" autoFocus={first} {...(range && { min: range[0], max: range[1], step: 1 })} value={String(value ?? "")} onChange={(e) => set(e.target.value)} />

  const markdown = kindOf(input) === "markdown"

  return (
    <Textarea
      rows={markdown ? 5 : 1}
      autoFocus={first}
      className={markdown ? "max-h-72 min-h-24 font-mono" : "max-h-48 min-h-0"}
      value={String(value ?? "")}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return
        if (markdown ? !(e.metaKey || e.ctrlKey) : e.shiftKey) return
        e.preventDefault()
        send()
      }}
    />
  )
}

/** A field's frame: a label around one control, a plain box around a picker's group. */
const Wrap = ({ picked, className, children }: { picked: boolean; className: string; children: ReactNode }) =>
  picked ? <div className={className}>{children}</div> : <label className={className}>{children}</label>

/** The fields the shell makes for an action's inputs, one each by what it is declared to be. */
function Form({ action, submit, close, refusal }: { action: Offered; submit: (args: Args) => Promise<unknown>; close: () => void; refusal: ReactNode }) {
  const [fields, setFields] = useState<Record<string, string | boolean>>({})
  const [busy, setBusy] = useState(false)
  const set = (field: string, value: string | boolean) => setFields((was) => ({ ...was, [field]: value }))
  const args = argsOf(action.handle.open, fields)
  const send = async () => {
    if (!args || busy) return
    setBusy(true)
    await submit(args).finally(() => setBusy(false))
  }

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      {Object.entries(action.handle.open).map(([field, input], i) => (
        // A picker is a group of its own, named by the field; a label around it would name its first choice.
        <Wrap key={field} picked={picked(input) !== undefined} className="flex flex-col gap-1">
          <span className="text-meta text-muted-foreground">{named(field)}</span>
          <Field name={named(field)} input={input} value={fields[field]} set={(value) => set(field, value)} first={i === 0} send={() => void send()} />
        </Wrap>
      ))}
      {refusal}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={!args || busy}>
          {named(action.handle.name)}
        </Button>
      </DialogFooter>
    </form>
  )
}
