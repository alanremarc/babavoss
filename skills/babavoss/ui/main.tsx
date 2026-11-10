import { createRoot } from "react-dom/client"
import { ClapperboardIcon, FileCogIcon } from "lucide-react"
import { App } from "#babavoss/shell/ui/index.ts"
import { AgentConfig } from "../src/utils/agent-config/ui/index.tsx"
import { Playground } from "../src/utils/playground/ui/index.tsx"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <App
    utils={{
      "agent-config": { component: AgentConfig, icon: <FileCogIcon aria-hidden /> },
      playground: { component: Playground, icon: <ClapperboardIcon aria-hidden /> },
    }}
  />
)
