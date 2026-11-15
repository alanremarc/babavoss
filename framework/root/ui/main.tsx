// The root's page: the shell with its one util, the roles.
import { createRoot } from "react-dom/client"
import { UsersIcon } from "lucide-react"
import { Shell } from "../../shell/ui/index.ts"
import { Roles } from "./roles.tsx"
import "./styles.css"

createRoot(document.getElementById("root")!).render(<Shell utils={{ roles: { component: Roles, icon: <UsersIcon aria-hidden /> } }} />)
