// The root's page where there is no .baba/: the shell with the picker alone. With one, the page is generated.
import { createRoot } from "react-dom/client"
import { LayoutGridIcon } from "lucide-react"
import { Shell } from "./index.tsx"
import { Surfaces } from "./picker.tsx"
import "./styles.css"

createRoot(document.getElementById("root")!).render(<Shell utils={{ surfaces: { component: Surfaces, icon: <LayoutGridIcon aria-hidden /> } }} />)
