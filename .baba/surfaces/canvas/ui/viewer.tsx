// An image viewer over the page: the images of one place (a note's images), one at a time, fitted to the window,
// zoomed by the wheel toward the pointer, the buttons or a double click, panned by dragging, and stepped with the arrow
// keys. Where no viewer is given, an image opens as a link instead.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, MinusIcon, PlusIcon, ScanIcon } from "lucide-react"
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "babavoss/kit/index.ts"
import { useConventions } from "babavoss/shell/ui/index.tsx"

export type Shown = { url: string; name: string }
type Viewer = { open: (url: string, name?: string) => void }

const ViewerContext = createContext<Viewer | undefined>(undefined)

/** The viewer of the images below it; `open` shows one of `images`, or one alone that is not among them. */
export const useViewer = () => useContext(ViewerContext)

const MIN = 1
const MAX = 8

export function ImageViewer({ images, children }: { images: Shown[]; children: ReactNode }) {
  const [shown, setShown] = useState<Shown>()
  const list = shown && !images.some((i) => i.url === shown.url) ? [shown] : images
  const at = shown ? list.findIndex((i) => i.url === shown.url) : -1
  const open = useCallback((url: string, name?: string) => setShown(images.find((i) => i.url === url) ?? { url, name: name ?? "" }), [images])
  const step = (by: number) => list.length > 1 && setShown(list[(at + by + list.length) % list.length])

  return (
    <ViewerContext.Provider value={{ open }}>
      {children}
      <Dialog open={!!shown} onOpenChange={(on) => !on && setShown(undefined)}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") step(-1)
            if (event.key === "ArrowRight") step(1)
          }}
        >
          {shown && <Stage key={shown.url} image={shown} index={at} count={list.length} step={step} close={() => setShown(undefined)} />}
        </DialogContent>
      </Dialog>
    </ViewerContext.Provider>
  )
}

function Stage({ image, index, count, step, close }: { image: Shown; index: number; count: number; step: (by: number) => void; close: () => void }) {
  const reduced = useConventions().motion === "reduced"
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean }>(undefined)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  /** Zoom to `scale` keeping the image's point under (px, py), relative to the frame's centre, where it is. */
  const zoomAt = (scale: number, px = 0, py = 0) =>
    setView((v) => {
      const s = Math.min(MAX, Math.max(MIN, scale))

      if (s === MIN) return { scale: MIN, x: 0, y: 0 }

      const k = s / v.scale

      return { scale: s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  const fromCentre = (clientX: number, clientY: number) => {
    const r = frame.current!.getBoundingClientRect()

    return [clientX - r.left - r.width / 2, clientY - r.top - r.height / 2] as const
  }

  // The wheel zooms; it is listened to directly, as React's own listener cannot keep the page from scrolling.
  useEffect(() => {
    const el = frame.current

    if (!el) return

    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const [px, py] = fromCentre(event.clientX, event.clientY)

      setView((v) => {
        const s = Math.min(MAX, Math.max(MIN, v.scale * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002))))

        if (s === MIN) return { scale: MIN, x: 0, y: 0 }

        const k = s / v.scale

        return { scale: s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })
    }

    el.addEventListener("wheel", wheel, { passive: false })

    return () => el.removeEventListener("wheel", wheel)
  }, [])

  return (
    <>
      <div className="flex h-bar shrink-0 items-center gap-2 border-b px-3">
        <DialogTitle className="min-w-0 truncate text-body font-medium">{image.name || "Image"}</DialogTitle>
        <DialogDescription className="shrink-0 text-meta text-muted-foreground">
          {count > 1 ? `${index + 1} of ${count}` : ""}
        </DialogDescription>
        <span className="flex-1" />
        <Button size="icon-sm" variant="ghost" aria-label="Zoom out" disabled={view.scale <= MIN} onClick={() => zoomAt(view.scale / 1.5)}>
          <MinusIcon aria-hidden />
        </Button>
        <span className="w-12 text-center text-meta text-muted-foreground tabular-nums">{Math.round(view.scale * 100)}%</span>
        <Button size="icon-sm" variant="ghost" aria-label="Zoom in" disabled={view.scale >= MAX} onClick={() => zoomAt(view.scale * 1.5)}>
          <PlusIcon aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Fit to window" disabled={view.scale === MIN} onClick={() => zoomAt(MIN)}>
          <ScanIcon aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Open the original" asChild>
          <a href={image.url} target="_blank" rel="noreferrer">
            <ExternalLinkIcon aria-hidden />
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>
          Close
        </Button>
      </div>
      <div
        ref={frame}
        className={`relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden bg-muted/40 select-none ${view.scale > MIN ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          drag.current = { x: event.clientX, y: event.clientY, tx: view.x, ty: view.y, moved: false }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const d = drag.current

          if (!d || view.scale <= MIN) return
          if (Math.abs(event.clientX - d.x) + Math.abs(event.clientY - d.y) > 3) {
            d.moved = true
            setDragging(true)
          }
          setView((v) => ({ ...v, x: d.tx + event.clientX - d.x, y: d.ty + event.clientY - d.y }))
        }}
        onPointerUp={() => {
          drag.current = undefined
          setDragging(false)
        }}
        onDoubleClick={(event) => {
          const [px, py] = fromCentre(event.clientX, event.clientY)

          zoomAt(view.scale > MIN ? MIN : 2.5, px, py)
        }}
      >
        <img
          src={image.url}
          alt={image.name}
          draggable={false}
          className={`max-h-full max-w-full object-contain ${dragging || reduced ? "" : "transition-transform duration-150 ease-out"}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
        {count > 1 && (
          <>
            <Button size="icon" variant="secondary" aria-label="Previous image" className="absolute left-3 rounded-full opacity-80 hover:opacity-100" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={() => step(-1)}>
              <ChevronLeftIcon aria-hidden />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Next image" className="absolute right-3 rounded-full opacity-80 hover:opacity-100" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={() => step(1)}>
              <ChevronRightIcon aria-hidden />
            </Button>
          </>
        )}
      </div>
    </>
  )
}
