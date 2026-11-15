// A sheet: a panel that slides in from the right edge over the page, below what stands above it, and keeps the page around
// it live: closed by Escape, by a press outside it, or by its owner. `top` is where it starts, as a Tailwind class.
import * as React from "react"
import { cn } from "cn"
import { Dialog as SheetPrimitive } from "radix-ui"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" modal={false} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-large font-medium", className)} {...props} />
}

function SheetContent({ className, top = "top-0", ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { top?: string }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Content
        data-slot="sheet-content"
        aria-describedby={undefined}
        className={cn(
          "fixed right-0 bottom-0 z-40 flex w-[min(24rem,100vw)] flex-col border-l bg-popover text-popover-foreground shadow-lg outline-none",
          "duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right motion-reduce:animate-none",
          top,
          className
        )}
        {...props}
      />
    </SheetPrimitive.Portal>
  )
}

export { Sheet, SheetContent, SheetTitle }
