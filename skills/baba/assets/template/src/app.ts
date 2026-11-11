// The app: a shell of one util, always open, run in the session's runtime, with the page the person sees it through.
// The agent reaches it through scripts/open.ts and nowhere else. Another job of the app is another util beside this one.
import { defineApp } from "babavoss/core/index.ts"
import { shell, shellUi, util } from "babavoss/shell/index.ts"
import { greeting } from "./surface.ts"

export default defineApp({
  name: "my-app",
  ui: shellUi(new URL("../ui/", import.meta.url)),
  surface: shell({ title: "my-app", utils: [util("greeting", "A greeting the agent proposes and the person decides on", greeting, { open: "always" })] }),
})
