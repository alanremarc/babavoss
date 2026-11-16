// The shell's shortcuts on the page: a key pressed anywhere, a surface's content too, is matched to the command the
// person bound it to (settings/src/keys.ts), and the browser's own use of the keys is prevented. Not while they write in
// a field, which keeps its keys, unless the field is a drawer's search; nor while a binding is being recorded.
import { useEffect, useRef } from "react"
import { commandOf, type CommandId } from "../settings/src/keys.ts"
import type { Settings } from "../settings/src/settings.ts"

export const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** What marks a drawer's search, where the shortcuts still work, so the drawer's shortcut closes it from there. */
export const SEARCH_MARK = "data-drawer-search"
/** What marks an element recording a binding, which takes every key. */
export const RECORDING_MARK = "data-recording-keys"

/** What a focused element is, as much as tells whether its keys are its own. */
export type Focused = { tagName: string; type?: string; isContentEditable?: boolean; marked: (name: string) => boolean }

const TYPELESS = new Set(["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image"])

/** Whether the shortcuts give way to what has focus: a field that takes text, other than a drawer's search, or a recording. */
export function yields(focused: Focused | undefined): boolean {
  if (!focused) return false
  if (focused.marked(RECORDING_MARK)) return true
  if (focused.marked(SEARCH_MARK)) return false

  const tag = focused.tagName.toUpperCase()

  return (tag === "INPUT" && !TYPELESS.has((focused.type ?? "text").toLowerCase())) || tag === "TEXTAREA" || tag === "SELECT" || focused.isContentEditable === true
}

const focusedOf = (element: Element | null): Focused | undefined =>
  element
    ? {
        tagName: element.tagName,
        type: (element as HTMLInputElement).type,
        isContentEditable: (element as HTMLElement).isContentEditable,
        marked: (name) => !!element.closest(`[${name}]`),
      }
    : undefined

/** Runs the command a key pressed is bound to, from anywhere on the page, before what has focus hears it. */
export function useShortcuts(keys: Settings["keys"], run: Partial<Record<CommandId, () => void>>) {
  const latest = useRef({ keys, run })

  latest.current = { keys, run }
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      const command = commandOf(event, latest.current.keys, mac)
      const fn = command && latest.current.run[command]

      if (!fn || yields(focusedOf(document.activeElement))) return
      event.preventDefault()
      event.stopPropagation()
      fn()
    }

    window.addEventListener("keydown", press, { capture: true })

    return () => window.removeEventListener("keydown", press, { capture: true })
  }, [])
}
