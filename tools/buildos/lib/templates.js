export const agentContract=`# BuildOS Agent Contract

This repository operates under BuildOS regardless of which AI coding agent is active.

Before editing, inspect existing product, architecture, authorization, schema, integrations, tests, and .buildos/agent-policy.json when present. Reuse canonical concepts. Do not create parallel implementations. Never suppress errors, fake success, bypass authorization, silently mutate production, or claim verification that was not performed.

For each coherent change: identify affected contracts; make the smallest complete change; add or update a .buildos/changes record; run BuildOS check before commit and BuildOS verify before push/release; keep machine state truthful.

When any BuildOS gate, test, typecheck, lint, build, CI, deployment, or production verification fails, the active AI MUST read .buildos/repair/latest.json, identify and repair the root cause, rerun the exact failed gate, continue only after it passes, redeploy the repaired exact SHA when deployment failed, and preserve the RED failure as evidence. Never bypass or weaken the gate. Stop only for a genuine external/human gate.

BuildOS is the canonical policy. Claude, Cursor, Copilot, Windsurf, Gemini, Codex/OpenAI, and other agent-specific instruction files are imported adapters with provenance, not competing sources of truth. Production is GREEN only after the exact deployed SHA is independently verified.
`;
export const specification=`# BuildOS

BuildOS is a policy, state, validation and release system for AI-built software.

## Lifecycle
REQUEST → PREFLIGHT → PLAN → EDIT → CHECK → REPAIR IF RED → COMMIT → VERIFY → CI → DEPLOY → PRODUCTION VERIFY → CERTIFY.

## Rules
- Inspect before changing.
- Normalize existing AI-agent instructions into canonical BuildOS policy while preserving provenance.
- Canonical stores are authoritative for facts; never invent missing state.
- Authorization is server-side and tested for allowed and denied behavior.
- Schema changes require explicit migration awareness and safe forward migration discipline.
- External integrations use adapters, authenticated/idempotent webhooks and observable errors.
- AI inference never silently becomes authoritative application state.
- A failed gate starts a repair/retry loop; it is never a reason to bypass the gate.
- No false green. Built, deployed, verified and green are distinct states.
- Releases are tied to exact repository, branch, commit SHA, deployment and verification evidence.
- Production-sensitive or destructive operations remain explicit human gates.
`;
export const config={version:1,stateDirectory:".buildos",agentContract:"AGENTS.md",specification:"BUILDOS.md",commands:{typecheck:"npm run typecheck",lint:"npm run lint",test:"npm test",build:"npm run build"},check:["state","typecheck","lint","test"],verify:["state","typecheck","lint","test","build"],requireChangeRecord:true,release:{requireCleanTree:true,requireExactSha:true}};
