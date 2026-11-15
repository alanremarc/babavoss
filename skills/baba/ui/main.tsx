import { createRoot } from "react-dom/client"
import { HammerIcon } from "lucide-react"
import { App } from "babavoss/shell/ui/index.ts"
import { Build } from "../src/utils/build/ui/index.tsx"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <App
    utils={{
      build: { component: Build, icon: <HammerIcon aria-hidden /> },
    }}
  />
)
