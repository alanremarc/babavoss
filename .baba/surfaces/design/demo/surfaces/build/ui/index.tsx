// The build page: its view at /, live, drawn by the page in view.tsx.
import { HammerIcon } from "lucide-react"
import { useLive } from "babavoss/shell/ui/index.tsx"
import BuildPage, { type BuildView } from "./view.tsx"

export const icon = <HammerIcon aria-hidden />

export default function Build() {
  const { view } = useLive<BuildView>("/")

  return view ? <BuildPage view={view} /> : null
}
