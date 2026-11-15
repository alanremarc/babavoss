// The page: the shell with the role's utils, each shown in its tab.
import { createRoot } from "react-dom/client"
import { MessageCircleIcon } from "lucide-react"
import { Shell } from "babavoss/shell/ui/index.ts"
import { Greeting } from "./greeting.tsx"
import "./styles.css"

createRoot(document.getElementById("root")!).render(<Shell utils={{ greeting: { component: Greeting, icon: <MessageCircleIcon aria-hidden /> } }} />)
