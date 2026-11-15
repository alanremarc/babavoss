// The page's boot island: what a root's page is served with, so its first frame is whole (door.ts). Pure, for the page reads it too.
/** The id of the page's boot island, `<script type="application/json" id="babavoss-boot">`. */
export const BOOT_ID = "babavoss-boot"
/** What the page is served with: the change its stream counts from, whose move it is, and views by their path, as the person reads them. */
export type Boot = { version: number; turn: unknown; views: Record<string, unknown> }

/**
 * The boot island: JSON in a script element that is never run. What a surface says may hold anything, so every character
 * that could end the element or open markup is escaped, as JSON lets a string say it: `<`, `>`, `&` and the line separators.
 */
export const island = (boot: Boot): string =>
  `<script type="application/json" id="${BOOT_ID}">${JSON.stringify(boot).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}</script>`
