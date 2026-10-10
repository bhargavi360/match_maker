# Global one-to-one allocation

The global allocation is a read-only suggestion preview. It uses the profile pool for the authenticated owner and one requested classification (REAL or DEMO). It does not create workflows, approvals, decisions, audits, or database writes. The existing human review flow remains the only way to approve a match.

## Graph and eligibility

The graph is general, not bipartite. Profile.gender is optional free-form reported text, the existing preference schema has no gender-preference field, and the current eligibility rules do not partition profiles into two sides. The allocator therefore preserves those rules and does not infer gender preferences.

Each vertex must be active, approved, schema-valid, adult, age-confirmed within the existing 365-day freshness rule, and have valid stored preferences. An edge exists only when the existing pair assessor reports ELIGIBLE and supplies a numeric compatibility score. Mutual hard deal-breaker violations and unresolved hard-rule evidence do not become edges. A null score remains unscored; it is not converted to zero or treated as incompatibility.

Profile exclusion counts can overlap when a record has multiple disqualifying conditions, such as being both archived and pending review.

## Objective and tie rules

The exact objective is to maximize the sum of the existing integer compatibility scores across zero to 25 non-overlapping pairs. It does not prioritize pair count and it has no minimum score or evidence threshold. If two allocations have the same total score, the allocation with fewer pairs wins. Within a fixed cardinality and score tie, vertices and edges are traversed in ascending stable profile-ID order, making the result deterministic for identical data regardless of database row order.

To honor the 25-pair cap exactly, the weighted blossom solver computes the maximum-score matching at each cardinality from 1 through 25. The allocator compares those stages using the unmodified compatibility-score totals and the tie rule above; it does not truncate a larger matching. Zero-score pairs do not increase the objective and lose a score tie to leaving profiles unmatched.

Scores remain the existing heuristic values, not probabilities. Selected pairs retain their existing matching reasons, recorded soft conflicts, and missing-evidence warnings. Unmatched profiles receive only a factual allocation status; the interface does not guess which unselected alternative caused the result.

## Algorithm and limits

The implementation uses Edmonds' weighted blossom primal-dual method for an undirected general graph. It is exact, supports odd cycles, and runs in O(V³) time; memory is O(V² + E). The service accepts at most 400 eligible profiles in one classification and returns an error rather than silently truncating a larger pool. The default profile matcher remains separately capped at 1,000 rows per classification, and its top-five-to-ten recommendations and local/natural-language search are unchanged.

The small vendored CommonJS blossom implementation is adapted from edmonds-blossom 1.0.0 under the MIT license; its license is retained beside the source. No package or dependency version was added or changed.
