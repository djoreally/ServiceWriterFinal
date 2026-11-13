# Review Pre-Gate — What a PR Carries Before It Reaches the Owner

Jira: SW-46. The owner's merge tap is a **decision, not an inspection**. No PR
is presented for a merge decision until the Review lane has checked it and
the PR carries the full packet below. If any element is missing, the PR goes
back to the builder — it does not go to the owner with a promise to fill it
in later.

## The pre-gate packet

Every PR body must contain all four elements:

1. **Evidence hash.** The head commit hash at the top of the PR body. This
   is the artifact being decided on; if the head moves after review, the
   packet is re-issued against the new hash.
2. **Gate results with exact counts.** From a fresh `npm ci` on the PR head:
   test suites and tests passed/failed, typecheck result, production build
   result, and lint on the changed files. Counts, not adjectives — "tests
   pass" without numbers is not a gate result. Pre-existing failures in
   untouched files are named as pre-existing.
3. **The Jira checklist.** The item's checklist copied into the PR, each
   line marked **done** or **explicitly pending with the reason** (for
   example: a step that can only complete after merge, such as live
   production proof, is marked pending-merge — never silently dropped and
   never marked done early).
4. **Review-lane sign-off line.** Who reviewed, what was checked beyond the
   gate numbers — the diff was read, contract and regression-lock risks were
   considered, the proof claims were traced to the actual tests — and any
   honest flags, including disagreements or residual risks the owner should
   know about before tapping merge.

## Trial record — 2026-11-13

This pre-gate was run on the three merges of 2026-11-13. Each PR carried the
full packet and was review-checked before it reached the owner:

| PR | Item | Packet highlights | Outcome |
| --- | --- | --- | --- |
| #277 | SW-42 — partial updates must never erase data they do not mention | Gate: 348 suites / 3,298 tests passed, typecheck clean, build passed. Proof standard: 11 new stateful-handler tests with a **red-before** run (6 failures with 2 fixes reverted), so the tests were shown to actually catch the defect. | Merged; deployment READY on the merge commit. |
| #274 | SW-86 — CARFAX settings screen hosted in Settings | Gate: 3,296 tests passed. Route proof per the standing route gate (source-pin + journey tests, REG-004 lock). Post-merge step completed as flagged: **live bundle proof after deploy** — the deployed production bundle was probed and contains the screen. | Merged; deployment READY; live proof closed the pending checklist line. |
| #278 | SW-87 — completed-at sync | Gate: 3,318 tests passed. The change carried a database migration, proven the SW-35 way: the **migration applied at deploy** by the deploy-time migration runner and verified in the production ledger. | Merged; deployment READY; migration verified applied. |

**Result of the trial:** no merge reached the owner without an evidence
hash, exact gate counts, and a completed-or-honestly-pending checklist. The
pre-gate is standing practice from 2026-11-13 onward.
