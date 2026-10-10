import blossom from "./vendor/edmonds-blossom.cjs";

export const MAX_ALLOCATION_PROFILES = 400;
export const MAX_ALLOCATION_COUPLES = 25;
const MAX_SCORE = 100;
type BlossomResult = { mate: number[]; stages: number[][] };
type WeightedEdge = [left: number, right: number, score: number];
export type AllocationEdge = { left: string; right: string; score: number };
export type AllocatedPair = { left: string; right: string; score: number };
export type AllocationResult = { pairs: AllocatedPair[]; totalScore: number };

function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function pairKey(a: string, b: string) { return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`; }

/**
 * Computes the exact score-first allocation on an undirected general graph.
 * Every cardinality-optimal blossom stage up to the cap is compared using the
 * original scores. Equal score totals prefer fewer pairs; IDs and edges are
 * sorted before the deterministic blossom traversal, independent of row order.
 */
export function allocateMaximumWeight(
  profileIds: string[],
  edges: AllocationEdge[],
  maxPairs = MAX_ALLOCATION_COUPLES,
): AllocationResult {
  if (profileIds.length > MAX_ALLOCATION_PROFILES) throw new RangeError(`Global allocation supports at most ${MAX_ALLOCATION_PROFILES} eligible profiles.`);
  if (!Number.isInteger(maxPairs) || maxPairs < 0 || maxPairs > MAX_ALLOCATION_COUPLES) throw new RangeError(`Global allocation supports 0 to ${MAX_ALLOCATION_COUPLES} couples.`);
  const ids = [...profileIds].sort(compareText);
  if (ids.some((id, index) => !id || (index > 0 && id === ids[index - 1]))) throw new TypeError("Allocation profile IDs must be unique non-empty strings.");
  const indexes = new Map(ids.map((id, index) => [id, index]));
  const seen = new Set<string>();
  const normalized = edges.map(edge => {
    const leftIndex = indexes.get(edge.left), rightIndex = indexes.get(edge.right);
    if (leftIndex === undefined || rightIndex === undefined || edge.left === edge.right) throw new TypeError("Allocation edges must connect two distinct supplied profiles.");
    if (!Number.isInteger(edge.score) || edge.score < 0 || edge.score > MAX_SCORE) throw new TypeError(`Allocation scores must be integers from 0 to ${MAX_SCORE}.`);
    const key = pairKey(edge.left, edge.right);
    if (seen.has(key)) throw new TypeError("Allocation edges must be unique.");
    seen.add(key);
    const left = compareText(edge.left, edge.right) < 0 ? edge.left : edge.right;
    const right = left === edge.left ? edge.right : edge.left;
    return { left, right, leftIndex: indexes.get(left)!, rightIndex: indexes.get(right)!, score: edge.score };
  }).sort((a, b) => a.leftIndex - b.leftIndex || a.rightIndex - b.rightIndex);
  if (!ids.length || !normalized.length || !maxPairs) return { pairs: [], totalScore: 0 };

  const scoreByPair = new Map(normalized.map(edge => [pairKey(edge.left, edge.right), edge.score]));
  const weightedEdges: WeightedEdge[] = normalized.map(edge => [edge.leftIndex, edge.rightIndex, edge.score]);
  const { stages } = blossom(weightedEdges, maxPairs) as BlossomResult;
  let bestPairs: AllocatedPair[] = [];
  let bestScore = 0;
  for (const mate of stages) {
    const pairs: AllocatedPair[] = [];
    for (let leftIndex = 0; leftIndex < mate.length; leftIndex++) {
      const rightIndex = mate[leftIndex];
      if (rightIndex <= leftIndex) continue;
      const left = ids[leftIndex], right = ids[rightIndex], score = scoreByPair.get(pairKey(left, right));
      if (score === undefined) throw new Error("The matching solver returned an edge that was not eligible for allocation.");
      pairs.push({ left, right, score });
    }
    pairs.sort((a, b) => compareText(a.left, b.left) || compareText(a.right, b.right));
    const score = pairs.reduce((sum, pair) => sum + pair.score, 0);
    if (score > bestScore || (score === bestScore && pairs.length < bestPairs.length)) {
      bestPairs = pairs;
      bestScore = score;
    }
  }
  return { pairs: bestPairs, totalScore: bestScore };
}
