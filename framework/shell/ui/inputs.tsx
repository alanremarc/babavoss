// What an action asks of the person before it runs, in a modal over the tab: the surface's own drawer for it, where its page
// exports one, or else a form the shell makes from the action's inputs, one field each, under its description. Both end in
// the same call; a refusal is shown in the modal with its reason and the modal stays open, and a call admitted closes it.
import { useState, type ComponentType, type ReactNode } from "react"
import { Button } from "../../kit/components/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../kit/components/dialog"
import { Input } from "../../kit/components/input"
import { Textarea } from "../../kit/components/textarea"
import type { Args, Handle, View } from "../../core/surface/view.ts"
import { argsOf, named, type Offered } from "./commands.ts"
import { useLive } from "./tab.tsx"

/**
 * What a drawer is given: the handle as offered, the path within the tab it is offered at, the view there now, `submit`,
 * which makes the call with the inputs and resolves with the reason where it is refused, and `close`, to give up.
 */
export type DrawerProps = { handle: Handle; path: string; view?: View; submit: (args: Args) => Promise<string | undefined>; close: () => void }
/** A page's drawers, by the name of the action each asks the inputs of: `export const drawers = { add: AddIssue }`. */
export type Drawers = Record<string, ComponentType<DrawerProps>>

export function Inputs({
  action,
  drawer: Drawer,
  call,
  close,
}: {
  action: Offered
  drawer?: ComponentType<DrawerProps>
  call: (action: Offered, args: Args) => Promise<string | undefined>
  close: () => void
}) {
  const { view } = useLive(action.path)
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

/** The fields the shell makes for an action's inputs, one each by its type; Enter submits, Shift+Enter breaks a line. */
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
                void send()
              }}
            />
          )}
        </label>
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
