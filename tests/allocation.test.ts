import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateMaximumWeight, MAX_ALLOCATION_COUPLES, MAX_ALLOCATION_PROFILES, type AllocationEdge } from "../src/domain/allocation";

function bruteForce(ids: string[], edges: AllocationEdge[], cap: number) {
  const scoreByPair = new Map(edges.map(edge => [[edge.left, edge.right].sort().join("\u0000"), edge.score]));
  let bestScore = 0, bestCount = 0;
  function walk(remaining: string[], score: number, count: number) {
    if (!remaining.length || count === cap) {
      if (score > bestScore || (score === bestScore && count < bestCount)) { bestScore = score; bestCount = count; }
      return;
    }
    const [first, ...rest] = remaining;
    walk(rest, score, count);
    for (let i = 0; i < rest.length; i++) {
      const second = rest[i], key = [first, second].sort().join("\u0000"), weight = scoreByPair.get(key);
      if (weight === undefined) continue;
      walk(rest.filter((_, index) => index !== i), score + weight, count + 1);
    }
  }
  walk(ids, 0, 0);
  return { score: bestScore, count: bestCount };
}

test("global optimum beats a greedy first-pair choice", () => {
  const result = allocateMaximumWeight(["a", "b", "c", "d"], [
    { left: "a", right: "b", score: 100 },
    { left: "a", right: "c", score: 60 },
    { left: "b", right: "d", score: 60 },
  ]);
  assert.deepEqual(result.pairs.map(pair => [pair.left, pair.right]), [["a", "c"], ["b", "d"]]);
  assert.equal(result.totalScore, 120);
});

test("odd-cycle alternatives use general-graph matching and leave one profile unmatched", () => {
  const result = allocateMaximumWeight(["a", "b", "c"], [
    { left: "a", right: "b", score: 70 },
    { left: "b", right: "c", score: 69 },
    { left: "c", right: "a", score: 80 },
  ]);
  assert.deepEqual(result.pairs, [{ left: "a", right: "c", score: 80 }]);
});

test("each profile appears in at most one allocated couple", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const edges = ids.flatMap((left, i) => ids.slice(i + 1).map((right, j) => ({ left, right, score: 50 + ((i + j) % 50) })));
  const result = allocateMaximumWeight(ids, edges);
  const participants = result.pairs.flatMap(pair => [pair.left, pair.right]);
  assert.equal(new Set(participants).size, participants.length);
});

test("deterministic allocation is invariant to profile and edge input order", () => {
  const ids = ["f", "a", "e", "b", "d", "c"];
  const edges: AllocationEdge[] = [
    { left: "a", right: "b", score: 50 }, { left: "a", right: "c", score: 50 },
    { left: "b", right: "d", score: 50 }, { left: "c", right: "e", score: 50 },
    { left: "d", right: "f", score: 50 }, { left: "e", right: "f", score: 50 },
    { left: "a", right: "f", score: 50 }, { left: "b", right: "e", score: 50 },
  ];
  const first = allocateMaximumWeight(ids, edges);
  const reversed = allocateMaximumWeight([...ids].reverse(), [...edges].reverse());
  assert.deepEqual(reversed, first);
});

test("profiles with no feasible scored edge remain unmatched", () => {
  assert.deepEqual(allocateMaximumWeight(["a", "b", "c"], []).pairs, []);
  assert.deepEqual(allocateMaximumWeight(["a", "b"], [{ left: "a", right: "b", score: 0 }]), { pairs: [], totalScore: 0 });
});

test("the score-first objective may leave a profile unmatched rather than force a zero-score pair", () => {
  const result = allocateMaximumWeight(["a", "b", "c", "d"], [
    { left: "a", right: "b", score: 90 },
    { left: "a", right: "c", score: 0 },
    { left: "b", right: "d", score: 0 },
  ]);
  assert.deepEqual(result.pairs, [{ left: "a", right: "b", score: 90 }]);
});

test("an exact optimizer beats greedy on several deterministic small general graphs", () => {
  let seed = 9137;
  const random = (max: number) => { seed = (seed * 48271) % 2147483647; return seed % max; };
  for (let sample = 0; sample < 36; sample++) {
    const ids = Array.from({ length: 8 }, (_, index) => `p${index}`);
    const edges: AllocationEdge[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (random(100) < 58) edges.push({ left: ids[i], right: ids[j], score: random(101) });
    const cap = 1 + random(4);
    const exact = bruteForce(ids, edges, cap);
    let actual;
    try { actual = allocateMaximumWeight(ids, edges, cap); }
    catch (error) { throw new Error(`sample ${sample}, cap ${cap}, edges ${JSON.stringify(edges)}: ${String(error)}`); }
    assert.equal(actual.totalScore, exact.score, `score mismatch for generated graph ${sample}: ${JSON.stringify(actual)}; edges=${JSON.stringify(edges)}`);
    assert.equal(actual.pairs.length, exact.count, `pair-count tie mismatch for generated graph ${sample}: ${JSON.stringify(actual)}; edges=${JSON.stringify(edges)}`);
  }
});

test("allocation returns fewer than 25 couples when that maximizes total score", () => {
  const result = allocateMaximumWeight(["a", "b", "c", "d", "e", "f"], [
    { left: "a", right: "b", score: 20 }, { left: "c", right: "d", score: 40 },
  ]);
  assert.equal(result.pairs.length, 2);
  assert.equal(result.totalScore, 60);
});

test("allocation never exceeds the 25-couple cap and optimizes within the cap", () => {
  const ids = Array.from({ length: 54 }, (_, index) => `p${String(index).padStart(2, "0")}`);
  const edges: AllocationEdge[] = [];
  for (let i = 0; i < ids.length; i += 2) edges.push({ left: ids[i], right: ids[i + 1], score: 60 + (i % 31) });
  const result = allocateMaximumWeight(ids, edges);
  assert.equal(result.pairs.length, MAX_ALLOCATION_COUPLES);
  assert.equal(result.totalScore, edges.map(edge => edge.score).sort((a, b) => b - a).slice(0, MAX_ALLOCATION_COUPLES).reduce((sum, score) => sum + score, 0));
});

test("exact cardinality stages are optimal under a cap, not a truncation of the unconstrained result", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const edges: AllocationEdge[] = [
    { left: "a", right: "b", score: 100 }, { left: "c", right: "d", score: 1 }, { left: "e", right: "f", score: 1 },
    { left: "a", right: "c", score: 60 }, { left: "b", right: "d", score: 60 },
  ];
  const exact = bruteForce(ids, edges, 2);
  const actual = allocateMaximumWeight(ids, edges, 2);
  assert.equal(actual.totalScore, exact.score);
  assert.equal(actual.pairs.length, exact.count);
  assert.deepEqual(actual.pairs.map(pair => pair.score), [60, 60]);
});

test("solver limits are explicit and malformed graphs fail closed", () => {
  assert.throws(() => allocateMaximumWeight(Array.from({ length: MAX_ALLOCATION_PROFILES + 1 }, (_, i) => `p${i}`), []), /at most/);
  assert.throws(() => allocateMaximumWeight(["a", "a"], []), /unique/);
  assert.throws(() => allocateMaximumWeight(["a", "b"], [{ left: "a", right: "b", score: 101 }]), /scores/);
  assert.throws(() => allocateMaximumWeight(["a", "b"], [{ left: "a", right: "c", score: 100 }]), /supplied profiles/);
});
