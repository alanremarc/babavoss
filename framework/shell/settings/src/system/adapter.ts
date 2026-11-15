// What a machine says of light and dark, behind one shape: an adapter per operating system, each the only code that
// knows how its system is asked. The shell asks the one that fits (index.ts); where none fits, or it cannot tell, the
// browser's own answer decides, as it always did.
import type { Mode } from "../settings.ts"

export type SystemAdapter = {
  name: string
  fits(platform: NodeJS.Platform): boolean
  /** The machine's mode now; undefined where it cannot be told. Quick, and never throws. */
  read(): Mode | undefined
}
