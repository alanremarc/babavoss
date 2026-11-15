// Where the page stands, and what it does when the agent points the person to a place. The URL is the surface path:
// / home, a tab's address, /NAME or /tabs/N, then the place within it. Pointing goes there at once,
// unless the person is in the middle of something: they are writing in a field, or acted on the page within QUIET_MS.
// Then the page offers the place instead, to click to go, until they go, dismiss it, or the agent points again.

/** Home's key: the page at /, where no tab is shown. */
export const HOME = "home"

/** A place on the page: the tab's key, its address, or HOME, and the route within it. */
export type Place = { key: string; route: string }
/** The shell's `pointed` at /: the place and how many times the agent has pointed. */
export type Pointed = { at: string; n: number }

/** How long after the person's last click, key or scroll the page holds a pointing back as an offer. */
export const QUIET_MS = 3000

/** The place a path names: a tab's address is /tabs/N, or /NAME, its surface's name; a path that is no open tab's is home's. */
export function placeOf(path: string): Place {
  const clean = path.replace(/\/$/, "") || "/"
  const tab = /^(\/tabs\/\d+|\/(?!(?:tabs|activity)(?:\/|$))[a-z][a-z0-9-]*)(\/.*)?$/.exec(clean)

  if (tab) return { key: tab[1]!, route: tab[2] || "/" }

  return { key: HOME, route: "/" }
}

/**
 * What a fresh look at / brings: the pointing made since the count `seen`, if any. On the page's first look, `seen` is
 * undefined and only the count is taken, so a page loaded after a pointing does not go there again.
 */
export function pointedSince(seen: number | undefined, pointed: Pointed | undefined): { seen: number; fresh?: Pointed } {
  const n = pointed?.n ?? 0

  if (seen === undefined || !pointed || n <= seen) return { seen: Math.max(n, seen ?? 0) }

  return { seen: n, fresh: pointed }
}

/** Whether the page goes to a pointed place or offers it: it offers while the person writes in a field or acted within QUIET_MS. */
export function arrival(person: { typing: boolean; acted: number }, now: number): "go" | "offer" {
  return person.typing || now - person.acted < QUIET_MS ? "offer" : "go"
}

/**
 * Whether the person is writing in an element: a field or an editable region that holds text, or an embedded page, whose
 * keys the page cannot see. An empty field that only has focus, such as home's search, holds nothing to lose.
 */
export function typingIn(element: Element | null): boolean {
  if (!element) return false
  if (element.tagName === "IFRAME") return true
  if (element.tagName === "INPUT") {
    const input = element as HTMLInputElement

    return !["button", "checkbox", "radio", "submit", "reset", "range", "color"].includes(input.type) && input.value !== ""
  }
  if (element.tagName === "TEXTAREA") return (element as HTMLTextAreaElement).value !== ""

  return (element as HTMLElement).isContentEditable === true && (element.textContent ?? "") !== ""
}
