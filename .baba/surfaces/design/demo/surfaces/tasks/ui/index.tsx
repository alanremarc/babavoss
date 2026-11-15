// The tasks page: its view at /, live, drawn by the page in view.tsx, the asks called from it.
import { ListChecksIcon } from "lucide-react"
import { useLive, useTab } from "babavoss/shell/ui/index.tsx"
import TasksPage, { type TasksView } from "./view.tsx"

export const icon = <ListChecksIcon aria-hidden />

export default function Tasks() {
  const { view } = useLive<TasksView>("/")
  const { call } = useTab()

  return view ? <TasksPage view={view} call={(path, h) => void call(path, h.name, h.args)} /> : null
}
