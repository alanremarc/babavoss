# App

An app is one skill: SKILL.md at the root, with its references, software and framework in the same directory. Install that directory among the harness's skills. Its one entry is scripts/open.ts. The agent enters through the skill's door, then operates the app by name, or through `bv NAME` when that command name is occupied. Installed for the person, it keeps what it writes in `~/.babavoss/`, with its word beside Bun. Installed in a project, it uses the project’s self-ignoring `.babavoss/`, including `.babavoss/bin/NAME`, called from the project directory. An app run from source uses the directory the door was run from. State lives in `sessions/SESSION/APP/` under that home. `BABAVOSS_HOME` and `BABAVOSS_BIN` override these locations; old state locations are not migrated.

Build on the shell: an app starts as one util that is always open, and another job of the app is another util beside it. The framework alone is for an app that brings its own page or has none. Every app has a surface; give it a page where the person has something to see or decide. The page renders views and calls handles as the person.

The session is the unit of state, runtime, page and directory. Open in the project where the app should work; it keeps that directory for the session. Agents sharing a session act in its name and share its offered view.

The runtime wakes on a request and sleeps when idle or told to close. It loads a change in the app's code in place, so its address and the person's open page stay. A new instance takes the address its session last had where that is free; pass the address to the person when the app names a new one. It needs a resident process, a file lock, loopback and writable state. The person owns changes to the harness's configuration. See [Diagnosis](diagnosis.md) for a refused door.

A program can use the framework's `connect`, exported from #babavoss/core/index.ts, to reach the runtime with an app definition and session identity.

Keep data that must outlive the session in files or a service. The model is what was last read from there; session state is framework-persisted and written only by update. See [Surface](surface.md) for its design.
