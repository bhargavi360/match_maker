# Profile domain foundation

This additive foundation supports later profile review and matching work. It does not add an admin bootstrap, profile import, gender matching, or a UI review flow.

## Account role

`User.role` is a checked string value: `USER` or `ADMIN`. Existing and newly created accounts default to `USER`. This migration does not grant or promote any account. Authorization changes require a separately reviewed admin provisioning flow.

## Reported gender

`Profile.gender` is nullable text, at most 80 characters. A non-empty value is an explicitly reported label, trimmed at the boundary and otherwise preserved. Empty input and the exact labels `unknown`, `undisclosed`, `not disclosed`, `prefer not to say`, and `prefer not to disclose` are represented as `null`.

No canonical gender vocabulary or self-description field is introduced because the current product has no approved gender taxonomy. Existing profiles stay `null`; no value is inferred. This text is not a matching signal. Future gender-aware matching must first define and validate an approved preference vocabulary rather than treating free text as a compatibility rule.

## Profile review

`Profile.reviewStatus` is `PENDING`, `APPROVED`, or `REJECTED`. Existing records default to `APPROVED`, preserving their effective availability. Non-approved profiles must remain `ARCHIVED`; SQLite triggers enforce this invariant, so existing active-only matching cannot include a pending or rejected profile even before matching code gains review-status filters. A later import flow should create DEMO records as `PENDING` and `ARCHIVED`, then activate them only through an explicit review decision.

The existing `status` field continues to represent active versus archived availability. Review status is separate because `ARCHIVED` alone cannot distinguish an imported record awaiting review from a previously approved profile archived for another reason.
