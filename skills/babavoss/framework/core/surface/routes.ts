// Paths within a surface. A route pattern names one path shape: `/` the whole, `:name` capturing one segment. A
// path is part of the address, never state; reading it moves nobody.
import type { View } from "./view.ts"

/** The segments a route pattern captured, by name. */
export type Params = Record<string, string>
/** A surface's routes: `/` the whole, and a pattern per addressable object. */
export type Routes<M> = { "/": (model: M) => View } & { [pattern: string]: (model: M, params: Params) => View | undefined }

export const segments = (path: string): string[] => path.split("/").filter(Boolean)

/** What `pattern` captures from `path`; undefined when the path has another shape. */
export function match(pattern: string, path: string): Params | undefined {
  const shape = segments(pattern)
  const parts = segments(path)

  if (shape.length !== parts.length) return undefined

  const params: Params = {}

  for (const [i, segment] of shape.entries()) {
    if (segment.startsWith(":")) params[segment.slice(1)] = parts[i]!
    else if (segment !== parts[i]) return undefined
  }

  return params
}

/** The route a path matches, with what its pattern captured; undefined when none does. */
export function route<M>(routes: Routes<M>, path: string): { project: (model: M, params: Params) => View | undefined; params: Params } | undefined {
  for (const [pattern, project] of Object.entries(routes)) {
    const params = match(pattern, path)

    if (params) return { project, params }
  }

  return undefined
}

/** Whether `path` stands at or under `anchor`; `/` holds everything. */
export const within = (anchor: string, path: string): boolean => anchor === "/" || path === anchor || path.startsWith(`${anchor}/`)
