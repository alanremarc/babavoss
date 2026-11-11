// What the user side does in a run with a started agent, in order, as a program: an app keeps scenarios/<name>.ts,
// and the authoring app runs them. Types only; the runner is the author's.
import type { Answer } from "../surface/run.ts"
import type { Args, View } from "../surface/view.ts"

/** The user side of a run: the agent spoken to, the app's surface called and read as the person. */
export type ScenarioUser = {
  /** A message to the agent; resolves when its turn is done. */
  say(text: string): Promise<void>
  /** A call as the person, as a click on the page makes it; resolves with the outcome, a refusal included. */
  call(path: string, handle: string, input: Args): Promise<Answer>
  /** The view at a path of the app's surface as the person sees it; undefined when the path has nothing. */
  read(path: string): Promise<View | undefined>
  /** A label in the trace. */
  note(text: string): void
}

/**
 * The default export of scenarios/<name>.ts. A run makes its own workspace, with fresh app state, in place of the one
 * its last run made, or runs in a workspace picked; a throw fails the scenario.
 */
export type Scenario = {
  description?: string
  /** The setup it runs under, by name from scenarios/setups.yaml; the one selected otherwise. */
  setup?: string
  /** The preset the workspace it makes is filled from, by name: assets/presets/<name>/ in the app, or `empty`; the one selected otherwise. */
  preset?: string
  run(user: ScenarioUser): Promise<void>
}
