// The welcome page of a util with several scopes (projects, repositories, blueprints): with none open, the content lists
// them to pick from, filtered, and the util's tools are still at hand. Any layout shows it in place of its content.
import { useState, type ReactNode } from "react"
import type { Menu } from "./menu.tsx"
import { muted, SearchField } from "./parts.tsx"

/** One scope a util can open: its name, what it is, and a short aside such as its state or counts. */
export type Scope = { id: string; label: string; description?: string; aside?: ReactNode }

/**
 * The scopes of a util with several: `current` is the open one, which the util decides (its route); `open` opens
 * another, or with nothing returns to the welcome page. `title` names them all. `all: false` where there is no welcome
 * page to return to, such as a single scope: the menu then offers no way back to it.
 */
export type Scopes = { title: string; hint?: string; list: Scope[]; current?: string; all?: false; open: (id: string | undefined) => void }

/** The scope's menu, named by the open one: every scope to switch to, and the welcome page with them all where there is one. */
export const scopeMenu = (scopes: Scopes): Menu => ({
  id: "scope",
  label: scopes.list.find((s) => s.id === scopes.current)?.label ?? scopes.current ?? scopes.title,
  items: [
    { kind: "choice", id: "scopes", label: scopes.title, value: scopes.current ?? "", options: scopes.list, set: (id) => scopes.open(id) },
    ...(scopes.all === false
      ? []
      : [
          { kind: "separator" as const, id: "all-edge" },
          {
            kind: "action" as const,
            id: "all",
            label: `All ${scopes.title.toLowerCase()}`,
            run: () => scopes.open(undefined),
            disabled: scopes.current === undefined,
          },
        ]),
  ],
})

/** The content before a scope is open: every scope to pick from, filtered. */
export function Welcome({ scopes }: { scopes: Scopes }) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = scopes.list.filter((s) => !q || `${s.label} ${s.description ?? ""}`.toLowerCase().includes(q))

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6">
        {scopes.hint && <p className={muted}>{scopes.hint}</p>}
        <div className="flex">
          <SearchField label={`Filter ${scopes.title.toLowerCase()}`} value={query} set={setQuery} />
        </div>
        {shown.length ? (
          <ul aria-label={scopes.title} className="flex flex-col rounded-md border">
            {shown.map((s) => (
              <li key={s.id} className="border-t first:border-t-0">
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left outline-none hover:bg-foreground/4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  onClick={() => scopes.open(s.id)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{s.label}</span>
                    {s.description && <span className={`truncate ${muted}`}>{s.description}</span>}
                  </span>
                  {s.aside && <span className={`flex shrink-0 items-center gap-3 text-meta ${muted}`}>{s.aside}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={muted}>Nothing matches.</p>
        )}
      </div>
    </div>
  )
}
