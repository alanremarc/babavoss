// The activity's channels: its entries gathered by the tab they are in, as a messaging app gathers messages into
// conversations, each named by its tab and ordered by its latest message; the shell's own entries, opening and closing tabs
// and anything in no tab, are one more, named by the root. A tab the person is needed by is pinned first, its need on it.
// A closed tab's channel stays while its history is kept. Here too what the drawer reads: its rows, their time, groups and
// previews. Pure: the drawer draws them (activity.tsx, notifications.tsx).

export type Who = "person" | "agent" | "surface"
/**
 * An entry as /activity gives it: `when` UTC to the second, `at` null where its tab is closed, `tab` the tab it is in, closed
 * or not, absent for the shell's own; `kind` absent at /activity/notices, all notices.
 */
export type Row = { n: number; when: string; who: Who; kind?: "notice" | "call"; surface: string; at: string | null; tab?: string; title?: string; what: string }
/** A tab that needs someone, as / gathers it. */
export type Need = { at: string; surface: string; who: "person" | "agent"; why: string }
export type Group = { label: string; rows: Row[] }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const dateOf = (when: Date, now: Date) =>
  `${MONTHS[when.getMonth()]} ${when.getDate()}${when.getFullYear() === now.getFullYear() ? "" : `, ${when.getFullYear()}`}`

/** The group a time falls in, seen at `now`: the last hour, earlier today, yesterday, or its date. */
export function groupOf(when: Date, now: Date): string {
  if (now.getTime() - when.getTime() < HOUR) return "Now"

  const days = Math.round((dayOf(now) - dayOf(when)) / (24 * HOUR))

  if (days <= 0) return "Earlier today"
  if (days === 1) return "Yesterday"

  return dateOf(when, now)
}

/** Rows, newest first, in runs of the same group, in their order. */
export function groupsOf(rows: Row[], now: Date): Group[] {
  const groups: Group[] = []

  for (const row of rows) {
    const label = groupOf(new Date(row.when), now)
    const last = groups.at(-1)

    if (last?.label === label) last.rows.push(row)
    else groups.push({ label, rows: [row] })
  }

  return groups
}

/** How long ago, as a line's right edge says it: now, minutes, hours up to six, then the clock time. */
export function agoOf(when: Date, now: Date): string {
  const ago = now.getTime() - when.getTime()

  if (ago < MINUTE) return "now"
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m`
  if (ago < 6 * HOUR) return `${Math.floor(ago / HOUR)}h`

  return when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/** Why a tab needs the person, as a line: "to approve or drop 1 draft" reads "Approve or drop 1 draft". */
export const needLine = (why: string): string => {
  const line = why.replace(/^to\s+/i, "")

  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** An open tab as the strip shows it: its address, its surface and its title. */
export type TabInfo = { at: string; surface: string; label: string }
/**
 * A channel: `key` its tab's address, or the shell's own; its name and surface; whether its tab is closed; its rows, newest
 * first; how many of them the person has not seen; and what it needs of them, where its tab does.
 */
export type Channel = { key: string; name: string; surface?: string; closed: boolean; rows: Row[]; unseen: number; need?: Need }
/** Where the drawer stands: the list of channels, or one channel's history. */
export type Level = "list" | "channel"

/** The key of the shell's own channel. */
export const SHELL = "/"

/** The channel a row is in: its tab, or the shell's own where it is in none, as its opening and closing of tabs are. */
export const channelOf = (row: Row): string => row.tab ?? SHELL

/**
 * What the channel `key` is called, from its open tab, its rows and its surface: the shell's own by `shell`; a tab's by its
 * title, open from the strip, closed from what its rows say it had; else by its surface, and at worst its key.
 */
export const nameOf = (key: string, tab: TabInfo | undefined, rows: Row[], surface: string | undefined, shell: string): string =>
  key === SHELL ? shell : (tab?.label ?? rows.find((r) => r.title)?.title ?? surface ?? key)

/** The channels with every name pointing at one tab: where two share one, each says its tab's address after it. */
export function distinct<C extends { key: string; name: string }>(channels: C[]): C[] {
  const count = new Map<string, number>()

  for (const c of channels) count.set(c.name, (count.get(c.name) ?? 0) + 1)

  return channels.map((c) => ((count.get(c.name) ?? 0) > 1 && c.key !== SHELL ? { ...c, name: `${c.name} · ${c.key}` } : c))
}

/**
 * The channels of `rows`, newest first, from the open `tabs`, the `needs` of the person and the numbers of the notices they
 * have not seen; `shell` names the shell's own. Each is named so it points at one tab (nameOf, distinct). A tab that needs
 * the person has a channel, with messages or not, pinned above the rest; the rest go by their latest message.
 */
export function channelsOf(rows: Row[], tabs: TabInfo[], needs: Need[], fresh: ReadonlySet<number>, shell: string): Channel[] {
  const by = new Map<string, Row[]>()

  for (const row of rows) {
    const key = channelOf(row)

    by.set(key, [...(by.get(key) ?? []), row])
  }
  for (const need of needs) if (!by.has(need.at)) by.set(need.at, [])

  const channels = [...by].map(([key, rows]): Channel => {
    const tab = tabs.find((t) => t.at === key)
    const need = needs.find((n) => n.at === key)
    const surface = key === SHELL ? undefined : (tab?.surface ?? need?.surface ?? rows[0]?.surface)

    return {
      key,
      name: nameOf(key, tab, rows, surface, shell),
      ...(surface !== undefined && { surface }),
      closed: key !== SHELL && !tab,
      rows,
      unseen: rows.filter((r) => fresh.has(r.n)).length,
      ...(need && { need }),
    }
  })
  const latest = (c: Channel) => c.rows[0]?.n ?? 0

  return distinct(channels).sort((a, b) => Number(!!b.need) - Number(!!a.need) || latest(b) - latest(a))
}

/**
 * A channel's preview of a row: who said it, where it helps, and what. The surface speaks in its own channel unnamed; in
 * the shell's, what it did to a tab names the tab's surface.
 */
export function previewOf(row: Row): { by?: string; text: string } {
  const by = row.who === "person" ? "You" : row.who === "agent" ? "Agent" : undefined
  const place = placeIn(row, SHELL)

  return { ...(by && { by }), text: place ? `${row.what} · ${place}` : row.what }
}

/**
 * Where a row is within its channel, where that is more specific than the channel: "/tabs/2/issues/12" in /tabs/2 is
 * "issues/12"; in the shell's own, a row about a tab is that tab's surface.
 */
export function placeIn(row: Row, key: string): string | undefined {
  if (key === SHELL) return row.tab === undefined && row.at !== "/" ? row.surface : undefined

  return row.at !== null && row.at.startsWith(`${key}/`) ? row.at.slice(key.length + 1) : undefined
}

/** Whether a row arrived since `since`, the newest entry then, as a notice by someone else: what lights a line or dots the way back. */
export const arrived = (row: Row, since: number): boolean => row.n > since && row.kind !== "call" && row.who !== "person"

/** What a key does on a level: in a channel, Escape, Backspace and the left arrow go back; elsewhere the drawer handles it. */
export const levelKey = (key: string, level: Level): "back" | undefined =>
  level === "channel" && (key === "Escape" || key === "Backspace" || key === "ArrowLeft") ? "back" : undefined

/**
 * The tab a place is in, the channel a toast opens on: "/tabs/2/issues/12" is in /tabs/2, "/queue/issues/12" in /queue, the
 * address of the tab at its surface's name; anything else is the shell's.
 */
export const tabIn = (at: string | undefined): string => (at && /^(?:\/tabs\/\d+|\/(?!(?:tabs|activity)(?:\/|$))[a-z][a-z0-9-]*)/.exec(at)?.[0]) || SHELL
