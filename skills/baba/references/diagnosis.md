# Diagnose an app that does not answer

Start with `bv` to see what is open here. If the door is refused, pass its own line to the person: the harness configuration is theirs to change. Read `bv help` for the operating guide.

For a person’s install, inspect `~/.babavoss/` and the word beside Bun. For a project install, inspect the project’s `.babavoss/` and call `.babavoss/bin/bv` from the project directory. Session data is in `sessions/SESSION/APP/` under that home; `BABAVOSS_HOME` and `BABAVOSS_BIN` override the locations.

Separate these failures:

- No answer: inspect the error. The runtime needs a resident process, a file lock, loopback and writable state. Report which requirement is denied.
- Refused call: check the current view and the refusal's reason. Correct the request instead of repeating it unchanged.
- Uncertain outcome: if the response was lost after dispatch, read state before retrying. The call may already have taken effect; stopping effects does not undo them.
- Unexpected state: check the relevant view. Agents sharing a session share what it was last answered.
- Person acted but nothing changed: distinguish a surface call from page navigation or a private draft.

Inspect the skill and computed open answer in the promptware util when instructions or initial facts look wrong. Reproduce the task in the playground and compare the trace with what the person expected. State what you observed, what failed and what remains unverified.
