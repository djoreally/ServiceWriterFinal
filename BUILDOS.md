# ServiceWriter BuildOS Contract

ServiceWriter uses BuildOS as a pre-flight release gate.

Lifecycle:

`request → inspect → reconcile → BuildOS check → native build → preview verify → merge → production verify`

For this repository, BuildOS check must validate machine state plus the existing `typecheck`, `lint`, and `test` scripts. The native Next.js build remains the final compile/build boundary and already includes ServiceWriter architecture, identity, and frontend UI contract checks.

Release state is intentionally fail-closed:
- built is not deployed;
- deployed is not verified;
- verified is not GREEN unless the exact source SHA and production deployment identity match.

Production database mutations remain an explicit release operation and are not performed by pre-flight checks.
