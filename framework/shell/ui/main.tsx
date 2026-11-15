// The shell's page where there is no .baba/, with no surface to hold. With one, .root/main.tsx is generated in its place.
import { createRoot } from "react-dom/client"
import Shell from "./index.tsx"
import "./styles.css"

createRoot(document.getElementById("root")!).render(<Shell surfaces={{}} />)
