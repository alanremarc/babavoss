// The harness conversation: one identity for state, runtime, page, directory and present.
export type Session = { harness: string; id: string; cwd: string }

/** The session's agent actor; agents sharing a session act in its name. */
export const agentActor = (session: Pick<Session, "id">): string => `agent:${session.id}`
export const isPerson = (actor: string): boolean => actor === "person"
