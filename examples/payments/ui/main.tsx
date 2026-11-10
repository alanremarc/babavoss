// The person settles unsure payments through the same surface the agent reads.
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import type { Handle } from "#babavoss/core/index.ts"
import { Button, call, changes, read } from "#babavoss/shell/ui/index.ts"
import "./styles.css"

type Month = { name: string; at: string; unsureAt: string; payments: number; matched: number; unsure: number; unmatched: number }
type Root = { months: Month[]; busy: boolean; error: string | null; corrected: { payments: string[] }; rules: { at: string } }
type Payment = {
  at: string
  payer: string
  amount: string
  reference: string
  guess?: string
  invoice?: string
  corrected?: boolean
  confirm?: Handle
  choose?: Handle
  leave?: Handle
}
type Rule = { text: string; at: string; remove: Handle }

function useView<V>(path: string) {
  const [state, setState] = useState<{ view?: V; error?: string }>({})

  useEffect(() => {
    let active = true
    let revision = 0
    const load = async () => {
      const current = ++revision

      try {
        const view = await read<V>(path)

        if (active && current === revision) setState({ view })
      } catch (error) {
        if (active && current === revision) setState({ error: String(error) })
      }
    }

    void load()

    const stop = changes(() => void load())

    return () => {
      active = false
      stop()
    }
  }, [path])

  return state
}
function ErrorText({ text }: { text?: string | null }) {
  return text ? (
    <p role="alert" className="text-sm text-destructive">
      {text}
    </p>
  ) : null
}
function Action({ path, handle, field, label }: { path: string; handle: Handle; field?: "text"; label: string }) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={async (event) => {
        event.preventDefault()
        setPending(true)
        try {
          const answer = await call(path, handle.name, { ...handle.args, ...(field ? { [field]: draft } : {}) })

          setError(answer.outcome === "written" ? undefined : answer.reason)
          if (answer.outcome === "written") setDraft("")
        } catch (error) {
          setError(String(error))
        } finally {
          setPending(false)
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {field && (
          <input
            className="h-8 w-72 max-w-full rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Rule sentence"
            placeholder="A rule in one sentence"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <Button size="sm" variant="outline" type="submit" disabled={pending} title={handle.description}>
          {label}
        </Button>
      </div>
      <ErrorText text={error} />
    </form>
  )
}
type Invoice = { number: string; customer: string; amount: string }

// One act of the person on a payment, with the app's reason shown where a call is refused.
function useAct(path: string) {
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const act = async (handle: Handle, more: Record<string, string> = {}) => {
    setPending(true)
    try {
      const answer = await call(path, handle.name, { ...handle.args, ...more })

      setError(answer.outcome === "written" ? undefined : answer.reason)
    } catch (error) {
      setError(String(error))
    } finally {
      setPending(false)
    }
  }

  return { act, error, pending }
}
// A payment on one line: who paid and how much, what the agent proposes, and the person's three ways to settle it.
function PaymentRow({ payment: p, open = [] }: { payment: Payment; open?: Invoice[] }) {
  const { act, error, pending } = useAct(p.at)
  const [other, setOther] = useState("")

  return (
    <li className="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <strong className="min-w-40 flex-1 truncate font-medium">{p.payer}</strong>
        <span className="w-20 text-right tabular-nums">{p.amount}</span>
        <span className="w-24 text-muted-foreground">
          {p.invoice ? `invoice ${p.invoice}` : p.guess ? `invoice ${p.guess}?` : p.reference ? `ref ${p.reference}` : "no reference"}
        </span>
        {p.corrected && <span className="font-medium text-primary">Corrected by you</span>}
        {p.confirm && (
          <Button size="sm" disabled={pending} title={p.confirm.description} onClick={() => void act(p.confirm!)}>
            Yes
          </Button>
        )}
        {p.choose && (
          <span className="flex items-center gap-1">
            <select
              className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm"
              aria-label={`Another invoice for ${p.payer}`}
              value={other}
              onChange={(event) => setOther(event.target.value)}
            >
              <option value="">{p.guess ? "Other…" : "Invoice…"}</option>
              {open
                .filter((i) => i.number !== p.guess)
                .map((i) => (
                  <option key={i.number} value={i.number}>
                    {i.number} · {i.customer} · {i.amount}
                  </option>
                ))}
            </select>
            <Button size="sm" variant="outline" disabled={pending || !other} title={p.choose.description} onClick={() => void act(p.choose!, { invoice: other })}>
              Match
            </Button>
          </span>
        )}
        {p.leave && (
          <Button size="sm" variant="ghost" disabled={pending} title={p.leave.description} onClick={() => void act(p.leave!)}>
            Leave
          </Button>
        )}
      </div>
      <ErrorText text={error} />
    </li>
  )
}
function Correction({ path }: { path: string }) {
  const state = useView<Payment>(path)

  return (
    <>
      <ErrorText text={state.error} />
      {state.view && <PaymentRow payment={state.view} />}
    </>
  )
}
function MonthView({ month }: { month: Month }) {
  const state = useView<{ payments: Payment[]; openInvoices: Invoice[] }>(month.unsureAt)
  const share = (n: number) => `${month.payments ? (n / month.payments) * 100 : 0}%`

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2">
        <span className="text-xl font-semibold">{month.name}</span>
        <span className="text-sm text-muted-foreground">{month.payments} payments</span>
      </h2>
      <div
        role="img"
        aria-label={`${month.matched} matched, ${month.unsure} unsure, ${month.unmatched} unmatched of ${month.payments}`}
        className="flex h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="bg-blue-600 dark:bg-blue-400" style={{ width: share(month.matched) }} />
        <div className="bg-primary" style={{ width: share(month.unsure) }} />
      </div>
      <p className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="text-blue-700 dark:text-blue-400">{month.matched} matched</span>
        {month.unmatched > 0 && <span className="text-muted-foreground">{month.unmatched} unmatched or left</span>}
        <span className="text-primary">{month.unsure} unsure</span>
      </p>
      <ErrorText text={state.error} />
      {state.view &&
        (state.view.payments.length ? (
          <ul className="flex flex-col gap-2">
            {state.view.payments.map((p) => (
              <PaymentRow key={p.at} payment={p} open={state.view!.openInvoices} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing unsure. Ask the agent to match any remaining payments.</p>
        ))}
    </section>
  )
}
function RuleRow({ path }: { path: string }) {
  const state = useView<Rule>(path)

  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <ErrorText text={state.error} />
      {state.view && (
        <>
          <p>{state.view.text}</p>
          <Action path={path} handle={state.view.remove} label="Remove" />
        </>
      )}
    </li>
  )
}
function Rules({ path }: { path: string }) {
  const state = useView<{ rules: { at: string }[]; add: Handle }>(path)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Rules</h2>
      <ErrorText text={state.error} />
      {state.view && (
        <>
          {state.view.rules.length ? (
            <ul className="flex flex-col gap-3">
              {state.view.rules.map((r) => (
                <RuleRow key={r.at} path={r.at} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No rules yet. Ask the agent what your corrections teach.</p>
          )}
          <Action path={path} handle={state.view.add} field="text" label="Add rule" />
        </>
      )}
    </section>
  )
}
function Page() {
  const state = useView<Root>("/")
  const [selected, setSelected] = useState("")
  const [connected, setConnected] = useState(true)

  useEffect(() => changes(() => {}, setConnected), [])

  const root = state.view
  const month = root?.months.find((m) => m.at === selected) ?? root?.months[0]

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Payments</h1>
        {root && root.months.length > 0 && (
          <label className="text-sm">
            Month{" "}
            <select className="rounded border border-input bg-background p-2" value={month?.at} onChange={(event) => setSelected(event.target.value)}>
              {root.months.map((m) => (
                <option key={m.at} value={m.at}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {!connected && <p role="status">Reconnecting…</p>}
      <ErrorText text={state.error ?? root?.error} />
      {root?.busy && (
        <p role="status" className="text-sm text-muted-foreground">
          Reading the files…
        </p>
      )}
      {root && (
        <>
          {month ? (
            <MonthView key={month.at} month={month} />
          ) : (
            <section>
              <h2 className="font-semibold">No month yet</h2>
              <p className="text-sm text-muted-foreground">Ask the agent to import a month from your payments and invoices CSV files.</p>
            </section>
          )}
          {root.corrected.payments.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">What you corrected</h2>
              <ul className="flex flex-col gap-2">
                {root.corrected.payments.map((path) => (
                  <Correction key={path} path={path} />
                ))}
              </ul>
            </section>
          )}
          <Rules path={root.rules.at} />
        </>
      )}
    </main>
  )
}
createRoot(document.getElementById("root")!).render(<Page />)
