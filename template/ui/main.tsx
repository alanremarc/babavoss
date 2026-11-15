// The page: the shell with the app's utils, each shown in its tab.
import { createRoot } from "react-dom/client"
import { MessageCircleIcon } from "lucide-react"
import { App } from "babavoss/shell/ui/index.ts"
import { Greeting } from "./greeting.tsx"
import "./styles.css"

createRoot(document.getElementById("root")!).render(<App utils={{ greeting: { component: Greeting, icon: <MessageCircleIcon aria-hidden /> } }} />)
