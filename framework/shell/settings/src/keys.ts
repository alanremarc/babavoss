// The shell's shortcuts, as values: its commands, each with what it does and its default binding; a binding written as
// the person writes it, `mod+p` or `mod+shift+k`, read, refused where it cannot be one, and said for a platform; and a key
// pressed matched to the command it is bound to, given the person's bindings. `mod` is ⌘ on a Mac and Ctrl elsewhere.
// Pure, for the settings surface and the page alike.

export const COMMANDS = {
  home: { does: "go home, and from home back to the tab shown before", keys: "mod+p" },
  next: { does: "go to the next tab in the strip, after the last to home", keys: "mod+k" },
  previous: { does: "go to the previous tab in the strip, before home to the last", keys: "mod+j" },
  menu: { does: "open the shown tab's menu", keys: "shift+f10" },
} as const

export type CommandId = keyof typeof COMMANDS

export const isCommand = (value: unknown): value is CommandId => typeof value === "string" && Object.hasOwn(COMMANDS, value)

const MODIFIERS = ["mod", "ctrl", "meta", "alt", "shift"] as const

type Modifier = (typeof MODIFIERS)[number]

const ALIASES: Record<string, Modifier> = {
  mod: "mod",
  cmd: "mod",
  command: "mod",
  "⌘": "mod",
  ctrl: "ctrl",
  control: "ctrl",
  "⌃": "ctrl",
  meta: "meta",
  super: "meta",
  win: "meta",
  alt: "alt",
  option: "alt",
  opt: "alt",
  "⌥": "alt",
  shift: "shift",
  "⇧": "shift",
}
const NAMED: Record<string, string> = {
  esc: "escape",
  escape: "escape",
  enter: "enter",
  return: "enter",
  tab: "tab",
  space: "space",
  backspace: "backspace",
  delete: "delete",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  arrowup: "arrowup",
  arrowdown: "arrowdown",
  arrowleft: "arrowleft",
  arrowright: "arrowright",
  home: "home",
  end: "end",
  pageup: "pageup",
  pagedown: "pagedown",
  comma: ",",
  period: ".",
  slash: "/",
  semicolon: ";",
  quote: "'",
  backslash: "\\",
  minus: "-",
  equal: "=",
  backquote: "`",
  bracketleft: "[",
  bracketright: "]",
}
const PUNCTUATION = new Set([",", ".", "/", ";", "'", "[", "]", "\\", "-", "=", "`"])
const FUNCTION = /^f([1-9]|1[0-9]|2[0-4])$/

const keyOf = (token: string): string | undefined =>
  /^[a-z0-9]$/.test(token) || PUNCTUATION.has(token) || FUNCTION.test(token) ? token : NAMED[token]

/**
 * A binding as it is kept: its modifiers in one order, then its key, all lower case; or why it cannot be one. A binding
 * is one key with modifiers, and one that types, a character alone or with Shift, is refused, as is a modifier alone.
 */
export function parse(written: string): { keys: string } | { refused: string } {
  const parts = written.trim().toLowerCase().replace(/\s*\+\s*/g, "+").split("+")
  const held = new Set<Modifier>()
  const keys: string[] = []

  if (!written.trim()) return { refused: "a binding names a key, such as mod+p" }
  for (const part of parts) {
    const modifier = ALIASES[part]

    if (modifier) held.add(modifier)
    else if (keyOf(part) !== undefined) keys.push(keyOf(part)!)
    else return { refused: `${part || "an empty part"} is no key: write a binding as mod+p, mod+shift+k or alt+f2` }
  }
  if (keys.length !== 1) return { refused: keys.length ? `a binding is one key with its modifiers, not ${keys.join(" and ")}` : "a binding names a key besides its modifiers" }

  const key = keys[0]!

  if (!FUNCTION.test(key) && ![...held].some((m) => m !== "shift"))
    return { refused: `${written.trim()} types text: a binding holds mod, ctrl, alt or meta, or is a function key` }

  return { keys: [...MODIFIERS.filter((m) => held.has(m)), key].join("+") }
}

/** A binding as it is kept, or undefined where it cannot be one. */
export const normal = (written: string): string | undefined => {
  const read = parse(written)

  return "keys" in read ? read.keys : undefined
}

/** A kept binding as the keys a platform presses: `mod` resolved to meta on a Mac, to ctrl elsewhere. */
const pressed = (keys: string, mac: boolean): string => {
  const parts = keys.split("+")
  const key = parts.pop()!
  const held = new Set(parts.map((m) => (m === "mod" ? (mac ? "meta" : "ctrl") : m)))

  return [...["ctrl", "meta", "alt", "shift"].filter((m) => held.has(m)), key].join("+")
}

/** Whether two kept bindings are the same keys on a Mac or elsewhere: `ctrl+p` is `mod+p` off a Mac. */
export const same = (a: string, b: string): boolean => pressed(a, true) === pressed(b, true) || pressed(a, false) === pressed(b, false)

/** Each command's binding: the person's where they set one, else its default. */
export const bindings = (keys: Partial<Record<CommandId, string>>): Record<CommandId, string> =>
  Object.fromEntries((Object.keys(COMMANDS) as CommandId[]).map((id) => [id, keys[id] ?? COMMANDS[id].keys])) as Record<CommandId, string>

/** The command other than `command` already bound to `keys`, which a binding of `command` to them would clash with. */
export function clashing(keys: Partial<Record<CommandId, string>>, command: CommandId, binding: string): CommandId | undefined {
  return (Object.entries(bindings(keys)) as [CommandId, string][]).find(([id, b]) => id !== command && same(b, binding))?.[0]
}

/** What a key event says, as much of it as a binding reads. */
export type Pressed = { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

const CODES: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
}

/**
 * The binding a key event is, as it is kept, from the key's place on the keyboard so a layout or Alt does not change it;
 * none for a modifier pressed alone. On a Mac ⌘ is `mod`, elsewhere Ctrl is.
 */
export function chordOf(event: Pressed, mac: boolean): string | undefined {
  const code = event.code ?? ""
  const key =
    /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase()
    : /^Digit[0-9]$/.test(code) ? code.slice(5)
    : (CODES[code] ?? keyOf(event.key.toLowerCase()) ?? keyOf(event.key.toLowerCase().replace(/^ $/, "space")))

  if (key === undefined) return undefined

  const held: Modifier[] = [
    ...((mac ? event.metaKey : event.ctrlKey) ? ["mod" as const] : []),
    ...(mac && event.ctrlKey ? ["ctrl" as const] : []),
    ...(!mac && event.metaKey ? ["meta" as const] : []),
    ...(event.altKey ? ["alt" as const] : []),
    ...(event.shiftKey ? ["shift" as const] : []),
  ]

  return [...held, key].join("+")
}

/** The command a key event is bound to, given the person's bindings; none where it is bound to none. */
export function commandOf(event: Pressed, keys: Partial<Record<CommandId, string>>, mac: boolean): CommandId | undefined {
  const chord = chordOf(event, mac)

  if (chord === undefined) return undefined

  return (Object.entries(bindings(keys)) as [CommandId, string][]).find(([, b]) => pressed(b, mac) === pressed(chord, mac))?.[0]
}

const GLYPHS: Record<string, string> = { mod: "⌘", ctrl: "⌃", meta: "⌘", alt: "⌥", shift: "⇧" }
const WORDS: Record<string, string> = { mod: "Ctrl", ctrl: "Ctrl", meta: "Meta", alt: "Alt", shift: "Shift" }
const KEYS: Record<string, string> = { escape: "Esc", enter: "Enter", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", space: "Space" }

/** A kept binding as the person reads it on their platform: ⌘⇧K on a Mac, Ctrl+Shift+K elsewhere. */
export function shown(keys: string, mac: boolean): string {
  const parts = keys.split("+")
  const key = parts.pop()!
  const name = KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1))

  return mac ? parts.map((m) => GLYPHS[m]).join("") + name : [...parts.map((m) => WORDS[m]), name].join("+")
}
