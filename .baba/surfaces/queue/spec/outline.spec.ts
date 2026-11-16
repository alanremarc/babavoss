// How the page folds a narrative's outline: a folded issue stays and what stands under it goes, and an issue is a branch
// where the next one stands deeper. The outline itself is the view's, told in the surface's stories.
import { expect, test } from "bun:test"
import { branches, fold } from "../src/outline.ts"

/** 1 with 2 under it and 3 under 2, then 4 beside 2, then 5 a root. */
const places = [
  { n: 1, depth: 0 },
  { n: 2, depth: 1 },
  { n: 3, depth: 2 },
  { n: 4, depth: 1 },
  { n: 5, depth: 0 },
]

test("folding an issue hides what stands under it, however deep, and nothing beside it", () => {
  expect(fold(places, new Set([2])).map((p) => p.n)).toEqual([1, 2, 4, 5])
  expect(fold(places, new Set([1])).map((p) => p.n)).toEqual([1, 5])
  expect(fold(places, new Set([1, 2])).map((p) => p.n)).toEqual([1, 5])
  expect(fold(places, new Set([3, 5])).map((p) => p.n)).toEqual([1, 2, 3, 4, 5])
})

test("an issue is a branch where the one after it stands deeper", () => {
  expect(places.map((_, i) => branches(places, i))).toEqual([true, true, false, false, false])
})
