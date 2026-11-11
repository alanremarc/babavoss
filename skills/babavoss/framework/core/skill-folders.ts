// Where the harnesses keep skills, in one place: for the person, under their home; in a project, under the project. The
// door reads it to tell where an app is installed, and so where it keeps what it writes; the authoring app reads it to
// install an app it makes.
import { homedir } from "node:os"
import { join } from "node:path"

export type SkillFolder = {
  /** The folder in a project, relative to it. */
  project: string
  /** The folder of the person's own skills. */
  personal(env?: NodeJS.ProcessEnv): string
  /** Whether a harness reads the project folder itself, so that an app made in a project is linked from it. Codex reads .agents/skills. */
  linked: boolean
}

export const SKILL_FOLDERS: readonly SkillFolder[] = [
  { project: ".agents/skills", personal: () => join(homedir(), ".agents/skills"), linked: true },
  { project: ".claude/skills", personal: (env = process.env) => join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "skills"), linked: true },
  { project: ".codex/skills", personal: (env = process.env) => join(env.CODEX_HOME ?? join(homedir(), ".codex"), "skills"), linked: false },
]

/** The project a directory is installed in: the one whose skill folder holds it; undefined when none does. */
export function installedIn(directory: string): string | undefined {
  const at = Math.max(...SKILL_FOLDERS.map((folder) => directory.lastIndexOf(`/${folder.project}/`)))

  return at < 0 ? undefined : directory.slice(0, at)
}
