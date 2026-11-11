import { createRoot } from "react-dom/client"
import { ClapperboardIcon, FileTextIcon, HammerIcon } from "lucide-react"
import { App } from "#babavoss/shell/ui/index.ts"
import { Promptware } from "../src/utils/promptware/ui/index.tsx"
import { Build } from "../src/utils/build/ui/index.tsx"
import { Playground } from "../src/utils/playground/ui/index.tsx"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <App
    utils={{
      build: { component: Build, icon: <HammerIcon aria-hidden /> },
      promptware: { component: Promptware, icon: <FileTextIcon aria-hidden /> },
      playground: { component: Playground, icon: <ClapperboardIcon aria-hidden /> },
    }}
  />
)
