# BuildOS — Service Writer

BuildOS is the release-control contract for Service Writer.

Lifecycle:
request → preflight → edit → check → repair → verify → CI → deploy → production verify → certify → Northstar

## Canonical boundaries
- Application: Next.js 16
- Production: Vercel project servicewriter.xyx
- Database/Auth: Supabase project rjfbrfognxqkyhdrpibx
- Tenant key: workspace_id
- Repository: djoreally/ServiceWriterFinal
- Production domain: servicewriter.xyz

## Release policy
A branch may not be treated as merge-ready when BuildOS verify is red or pending.
A production release may not be marked GREEN without exact-SHA deployment evidence.
Northstar receives BuildOS evidence and release attestations; Northstar does not replace BuildOS verification.

## Repair policy
A failure is input to the repair loop, not permission to bypass the gate. Repair the smallest complete root cause, rerun the failed gate, preserve RED evidence, then continue.
