// The conventions' specimen: each convention as the shell hands it now, read from useConventions(), with the attribute it
// stands as on the page's root; and a small page that follows them all, with no code of its own but where it must: its
// sidebar at the preferred side and its rail-facing edge by Tailwind's variants, its motion still where it is reduced, its
// text by the scale, its colours by the mode. Changing one in the settings changes it here at once.
import { LoaderCircleIcon, PanelLeftIcon, PanelRightIcon, SettingsIcon } from "lucide-react"
import { Badge, Button } from "babavoss/kit/index.ts"
import { useConventions, useShell, type Conventions } from "babavoss/shell/ui/index.tsx"
import { State, States } from "./frame.tsx"

/** What each convention is, and how a page follows it. */
const FOLLOWED: Record<keyof Conventions, string> = {
  motion: "nothing moves where it is reduced: the kit stills every animation, motion-safe: and motion-reduce: say the rest",
  scale: "the kit sizes in rem, which the scale sizes: a page drawn by its tokens follows unasked; --scale for a canvas",
  side: "a page's own sidebar stands at this side: side-left: and side-right:",
  rail: "the shell's tabs stand here: rail-left:, rail-right:, rail-top:, rail-bottom:, to keep clear of it or mirror it",
  mode: "the tokens follow it, and dark:; a library that draws its own colours is told it",
}

export function ConventionsSpecimen() {
  const conventions = useConventions()
  const { open } = useShell()

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border">
        {(Object.keys(FOLLOWED) as (keyof Conventions)[]).map((name) => (
          <div key={name} className="grid grid-cols-[4.5rem_6rem_minmax(0,1fr)] items-baseline gap-3 border-t px-3 py-1.5 first:border-t-0">
            <span className="font-mono text-meta">{name}</span>
            <Badge variant="secondary" className="justify-self-start font-mono">
              {String(conventions[name])}
            </Badge>
            <span className="text-meta text-muted-foreground">
              <code className="font-mono text-foreground/80">
                data-{name}
                {typeof conventions[name] === "number" && `, --${name}`}
              </code>{" "}
              · {FOLLOWED[name]}
            </span>
          </div>
        ))}
      </div>
      <States min={280}>
        <State label="a page that follows them: its sidebar, its motion, its text and its edge by the rail" wide className="p-0">
          <Following />
        </State>
      </States>
      <p className="flex items-center gap-2 text-meta text-muted-foreground">
        Change them in the settings, under Appearance, and watch this page follow.
        <Button variant="outline" size="xs" onClick={() => void open("settings")}>
          <SettingsIcon data-icon="inline-start" />
          Settings
        </Button>
      </p>
    </div>
  )
}

/** A page in small that follows every convention, mostly by the kit's variants alone. */
function Following() {
  const { side, motion, scale } = useConventions()
  const Panel = side === "left" ? PanelLeftIcon : PanelRightIcon

  return (
    <div className="flex h-44 w-full overflow-hidden rounded-lg side-left:flex-row-reverse">
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 rail-left:border-l-2 rail-left:border-l-primary/40 rail-right:border-r-2 rail-right:border-r-primary/40 rail-top:border-t-2 rail-top:border-t-primary/40 rail-bottom:border-b-2 rail-bottom:border-b-primary/40">
        <p className="text-large font-medium">The content</p>
        <p className="text-body text-muted-foreground">
          This text is at {Math.round(scale * 100)}%. The edge toward the shell's rail is marked; the sidebar stands at the {side}.
        </p>
        <div className="mt-auto flex items-center gap-2 text-meta text-muted-foreground">
          <LoaderCircleIcon aria-hidden className="size-icon text-primary motion-safe:animate-spin" />
          {motion === "reduced" ? "Still: motion is reduced" : "Turning: motion is full"}
          <span className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <span className="block h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse" />
          </span>
        </div>
      </div>
      <aside className="flex w-36 shrink-0 flex-col gap-1 border-l bg-sidebar p-2 side-left:border-l-0 side-left:border-r" aria-label="Sidebar">
        <span className="flex items-center gap-1.5 text-meta font-medium">
          <Panel aria-hidden className="size-glyph" />
          Sidebar, {side}
        </span>
        {["One", "Two", "Three"].map((row) => (
          <span key={row} className="rounded-sm px-1.5 py-0.5 text-body text-muted-foreground hover:bg-foreground/6">
            {row}
          </span>
        ))}
      </aside>
    </div>
  )
}
