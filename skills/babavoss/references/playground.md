# Try an app in the playground

Use the authoring app's playground util to try an app with an agent and inspect the same run with the person. Select the app when the project holds several; a project that is one app opens on it. Read the current view for paths and offered handles rather than copying tab numbers or arguments from another run.

## Workspaces and runs

Make a workspace from a preset on the person's word. A workspace is never the project or a directory someone types. It owns files/ for the agent's work, home/ for the harness and state/ for the app. It is kept with the author's data, by app, beyond the session that made it. Keep it until the person deletes it; deletion moves it to the trash.

A run is one agent session in a workspace under a setup. Only one is live at a time. A stopped run can resume with its harness record and app state intact. Prompt it by hand or run a scenario. Hand the person the playground page address so they can watch the trace and the app's page beside it.

## Presets and setups

Write assets/presets/<name>/ with the small, real files the task needs and assets/presets/<name>.md with a short description. Write them with the person. Keep secrets out of presets. Empty is always available.

Keep named setups in scenarios/setups.yaml: harness, model, effort and sandbox. The app version is read at the run, not fixed in the setup. Model and effort choices come from what the harness itself lists; the person may pick another over the setup, for the run from its next call and for the setup's next runs.

## Scenarios

Write scenarios/<name>.ts from the person's description. Import Scenario from #babavoss/core/index.ts and default-export an object with `run(user)`. Optional description, setup and preset fields are strings. Use `user.say(text)` for a message, `user.call(path, handle, input)` for a call, `user.read(path)` for a view and `user.note(text)` for a trace label. A scenario programs the user side, in order: messages to the agent and calls on the surface as the person. A message waits for the agent's turn to end. A call must use a handle the person's view offers, including its fixed arguments.

Keep one scenario about one behaviour, phrased as the person would ask for it. Include both the agent's task and the person's relevant call, especially an ask answered or a choice the agent must notice. Let the skill supply instructions about operating the app.

A scenario naming a preset makes its own workspace from it and replaces the workspace its last run made, so it repeats. One naming no preset continues in the open workspace. Either can run fresh or in a picked workspace. Choose explicitly according to whether the task needs fresh files and state or continuation.

## Trace and judgement

Inspect prompts, thinking, calls and results, changed views and cost where available. The trace marks the app's part: its skill as opened and bv's calls read back as surface calls. Model input sizes are measured by the harness; the app's share is estimated.

When the task goes wrong, compare what the agent was told, the view it received, the handles offered and the calls it chose. Fix the app when its instructions or surface failed the task; change the scenario only when it asked for the wrong thing. Run it again with the person watching. Judgement is the person's; no scores or graders.

## Isolation

The workspace has its own harness home; its shell reads no startup files. The agent has the app without the person's settings or skills. Credentials come from the runtime's environment when set; otherwise macOS can link the login keychain, and Codex copies its auth file. Elsewhere a token must be set once. Do not put credentials in presets or traces.

Shell commands and the app's runtime use the harness's sandbox. Loopback and writable workspace state must be allowed for bv to wake and reach the runtime. See [Diagnosis](diagnosis.md) for a run that cannot answer.
