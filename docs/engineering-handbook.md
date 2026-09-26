# Service Writer Backend Engineering Handbook

> **Audience:** a developer opening this repository for the first time, including a developer working on their first production project.
>
> **Purpose:** explain not only *what* this backend does, but *how professional work is done here and why*.

## 1. The mental model

Service Writer is an operational system for automotive service businesses. The backend is the authority for business state.

The primary lifecycle is:

```text
Booking → Customer → Vehicle → Service → Appointment → Work Order
        → Quote/Approval → Invoice → Payment → History/Dashboard
```

A user action such as “Create Appointment” is a **command**. The backend authenticates the caller, verifies workspace membership, validates the request, enforces business invariants, performs the authoritative database mutation, records the immutable domain event in the same transaction, commits, and only then allows asynchronous side effects to happen.

The browser does not own business truth.

## 2. Architecture in one picture

```text
Frontend
  │ HTTPS + Bearer JWT + x-workspace-id
  ▼
Next.js /api/v1 route
  │
  ├─ authentication
  ├─ workspace authorization
  ├─ Zod transport validation
  ▼
Application command
  │
  ├─ domain/business validation
  ├─ Drizzle transaction
  │    ├─ authoritative mutation
  │    ├─ immutable domain_events row
  │    └─ event_deliveries row
  ▼
PostgreSQL COMMIT
  │
  ├─ immediate API response
  └─ NOTIFY wake-up hint
        ▼
      Worker
        ├─ email
        ├─ SMS
        ├─ calendar
        ├─ webhooks
        └─ analytics
```

Supabase provides PostgreSQL infrastructure and identity. It is not permission for browser code to bypass the API.

## 3. Repository layers

### `src/app/api/v1` — transport

Routes translate HTTP into application calls. They own request parsing, authentication/authorization entry, response envelopes, CORS and transport-level status codes.

Routes **do not** contain SQL, pricing algorithms, lifecycle orchestration, or provider SDK business logic.

### `src/server/application` — use cases / commands

This is where business intent is expressed: `createCustomerCommand`, `createVehicleCommand`, eventually `createAppointmentCommand`, `approveQuoteCommand`, and so on.

A command answers: **what business operation did the human or trusted system explicitly request?**

Commands own transactions when multiple writes must succeed or fail together.

### `src/server/repositories` — persistence queries

Repositories encapsulate reusable persistence queries, especially reads. They do not decide business workflow.

Prefer names that state the query: `listCustomers`, `findActiveVehicleByVin`. Avoid vague names such as `getData`, `handleDb`, or `process`.

### `src/server/events` — event publication/delivery

Events describe facts that have already become true: `customer.created`, `appointment.rescheduled`, `payment.succeeded`.

An event is not an instruction to secretly advance the core lifecycle.

### `src/db/schema` — database contract

Drizzle schema must describe production PostgreSQL truth. Never “fix” a type mismatch by guessing. Inspect the production schema, understand the constraint, then change code or create an explicit reviewed migration.

## 4. The command/event rule

Human operational intent is synchronous and explicit.

Good:

```text
Advisor clicks Approve Quote
→ POST /quotes/:id/approve
→ approveQuoteCommand()
→ quote status changes
→ quote.approved event recorded
```

Bad:

```text
quote.created
→ listener guesses quote should be approved
→ listener changes work order
→ another trigger creates invoice
```

The second design hides business decisions inside infrastructure and becomes impossible to reason about.

## 5. Transactional outbox

Authoritative mutation and event publication happen in the same PostgreSQL transaction.

```ts
return db.transaction(async (tx) => {
  const [appointment] = await tx
    .insert(appointments)
    .values(values)
    .returning();

  await publishDomainEvent(tx, {
    workspaceId,
    aggregateType: 'appointment',
    aggregateId: appointment.id,
    eventType: 'appointment.created',
    idempotencyKey,
    payload: { appointmentId: appointment.id },
  });

  return appointment;
});
```

If event insertion fails, the appointment creation rolls back. If appointment creation fails, no event exists. We never intentionally create “business state changed but event disappeared” dual-write behavior.

`LISTEN/NOTIFY` is only a low-latency wake-up. The committed outbox is durability.

## 6. Event payloads

Default to identifiers. Snapshot facts only when rereading mutable state later could change historical meaning.

For `quote.approved`, appropriate snapshots can include the approved revision, approved total, approval method, terms version and approval timestamp.

Do not serialize entire customer/vehicle/workspace objects into every event.

Events are immutable facts. Delivery state is separate.

## 7. At-least-once delivery and idempotency

Workers can crash after an external provider accepted a request but before our database recorded success. Therefore “exactly once” cannot be promised across arbitrary external systems.

Consumers are designed for **at-least-once delivery**.

Prefer provider-native idempotency. Use a stable key derived from event ID + consumer name.

If the provider cannot prove whether an external effect occurred, record the execution as `ambiguous`. Never blindly claim success and never blindly repeat a potentially destructive effect.

## 8. Authentication and authorization

Authentication answers **who are you?** Authorization answers **may you do this here?**

The API verifies the Supabase access token server-side. `x-workspace-id` is not trusted merely because the browser sent it. It is a candidate workspace ID that must be checked against active membership.

Never trust browser-supplied role, tenant ownership, price, tax, invoice state, payment state, or object ownership.

## 9. TypeScript standard

Use TypeScript to make invalid states difficult to represent, not merely to silence the compiler.

### Required habits

- No `any` unless an external boundary makes it genuinely unavoidable and the reason is documented.
- Prefer inferred Drizzle/Zod types over duplicate hand-written interfaces.
- Use `unknown` for untrusted values and narrow them.
- Prefer discriminated unions for state-dependent data.
- Keep nullable and optional semantically distinct.
- Do not use non-null assertions (`!`) to bypass uncertainty without a proven invariant.
- Do not cast with `as SomeType` merely to make an error disappear.
- Parse external input at the boundary.
- Return domain-specific errors with stable codes.
- Exhaustively handle finite state transitions.

A type error is information about a disagreement in the system. Investigate it.

## 10. Naming standard

Names must communicate business meaning without requiring the reader to mentally execute the code.

Good:
- `workspaceId`
- `approvedTotal`
- `createAppointmentCommand`
- `requireWorkspaceAccess`
- `eventConsumerExecution`

Bad:
- `data`
- `obj`
- `thing`
- `temp`
- `res2`
- `doStuff`
- `handleEverything`

Boolean names should read as propositions: `isActive`, `hasApproval`, `canReschedule`.

Functions should use verbs. Types/entities should use nouns. IDs should name what they identify.

Avoid abbreviations unless they are established domain vocabulary such as VIN, API, URL, SMS or ID.

## 11. Functions and modules

A function should have one coherent responsibility and a name that tells the truth about it.

Do not optimize for artificially tiny functions. Optimize for understandable boundaries.

Prefer early validation/guard clauses over deeply nested conditionals.

Do not create “utils” dumping grounds. Put behavior in the domain or technical module that owns the concept.

Keep provider-specific code behind an integration boundary so Stripe, Resend, Google, etc. do not leak throughout domain code.

## 12. Comments: explain why, not syntax

Bad:

```ts
// Increment attempt count
attemptCount += 1;
```

Useful:

```ts
// A claimed delivery increments before the external call so a worker crash
// cannot create an infinite sequence of attempts that all appear to be attempt zero.
```

Comments are appropriate for:
- non-obvious business rules,
- failure semantics,
- concurrency reasoning,
- security boundaries,
- compatibility constraints,
- temporary compromises with a removal condition.

Delete stale comments when behavior changes. A wrong comment is worse than no comment.

## 13. Error handling

Never swallow errors.

Expected business/validation failures receive stable machine-readable error codes and safe human-readable messages.

Unexpected failures are logged with request/trace context and return a generic external message. Do not expose secrets, SQL, tokens, stack traces, provider credentials, or customer-sensitive data.

Distinguish retryable infrastructure failures from permanent business failures.

## 14. Database discipline

Production data is sacred.

- No destructive production migration during discovery.
- Migrations are reviewed, additive where practical, and reversible or accompanied by a rollback strategy.
- Constraints protect invariants even if application code has a bug.
- Tenant/workspace predicates belong in every tenant-scoped query.
- Use transactions for atomic business operations.
- Avoid N+1 query patterns.
- Add indexes because a demonstrated access path needs them, not because “indexes are good.”
- Never silently change enum semantics.
- Monetary arithmetic uses database numeric/decimal semantics; do not introduce floating-point money calculations.
- Timestamps are stored with timezone and business presentation uses the workspace timezone.

## 15. Concurrency

Assume two requests can happen at the same time.

Use database uniqueness, row locks, atomic updates and idempotency—not “the UI disables the button”—to protect invariants.

Outbox workers claim bounded batches with `FOR UPDATE SKIP LOCKED`. Processing leases must be recoverable after worker death.

## 16. API design

Version retained APIs under `/api/v1`.

Use consistent response envelopes and error codes.

POST commands that can be retried require `idempotency-key`.

Do not expose database table structure merely because it is convenient. API contracts describe product concepts.

Pagination is bounded. Inputs have length/range limits. IDs are validated. Writes are role-gated.

## 17. Security

Treat every external value as hostile until validated.

Never commit credentials, service-role keys, access tokens, customer secrets, payment data or private configuration.

Use least privilege. Keep external integrations server-side. Log identifiers and diagnostic context, not secrets.

Authorization checks must be testable independently of UI behavior.

## 18. Testing philosophy

Tests prove behavior, not implementation trivia.

For each command test:
- happy path,
- invalid input,
- wrong workspace,
- insufficient role where applicable,
- invalid lifecycle transition,
- duplicate/idempotent retry,
- concurrent/conflicting operation where applicable,
- transaction rollback,
- event publication,
- immutable snapshot semantics where applicable.

Integration tests should use realistic PostgreSQL behavior for transaction, constraint and locking semantics.

## 19. Observability

Every request receives a request/trace ID. Related events carry correlation and causation identifiers.

Logs should answer:
1. What operation was attempted?
2. In which workspace?
3. Against which aggregate?
4. What was the trace/correlation ID?
5. Did it commit?
6. If a side effect failed, which consumer/provider/attempt failed?
7. Is the outcome retryable, terminal, or ambiguous?

Never make logs the only source of business truth.

## 20. Commit standard

Commits are small enough to understand and large enough to represent a coherent engineering change.

Use imperative, specific subjects:

```text
feat: create appointments through transactional command
fix: prevent cross-workspace vehicle assignment
refactor: isolate Stripe payment adapter
test: cover stale outbox lease recovery
docs: explain quote approval invariants
chore: align Drizzle lockfile dependencies
```

Avoid:

```text
update
fix stuff
changes
wip
more fixes
final final
```

Before committing, inspect the diff. Do not mix unrelated formatting, architecture changes and bug fixes in one commit when they can be separated.

A commit message must not claim a fix was verified when verification did not run.

## 21. Pull request / review standard

A reviewer should be able to determine:
- the business problem,
- the chosen boundary,
- changed invariants,
- schema/API impact,
- security/tenant impact,
- migration impact,
- failure/retry behavior,
- tests actually executed,
- anything explicitly not verified.

Review for correctness first, readability second, cleverness last.

## 22. Professional writing standard

Code, comments, docs, commits and operational notes are permanent engineering communication.

Write complete, precise sentences. State evidence separately from assumptions. Avoid hype, vague claims and fake certainty.

Use:
- “Typecheck passed on commit X.”
- “Production migration has not been applied.”
- “This branch defines the schema but the runtime worker is not yet deployed.”

Do not use:
- “Should work.”
- “Basically fixed.”
- “Probably fine.”
- “Everything is green” when only a build succeeded.

## 23. Definition of done

Code existing in Git is not done.

A backend change is complete only when the relevant layers are verified: types, lint, tests, build, API behavior, database invariants, tenant isolation, failure paths, deployment/runtime configuration and—when applicable—the complete business journey.

Unknown is **UNVERIFIED**, never GREEN.

## 24. How a new developer should make a change

Example: add appointment cancellation.

1. Read `AGENTS.md`, this handbook, BuildOS state/checklist/ledger, and the relevant schema.
2. Identify the explicit business command: `cancelAppointmentCommand`.
3. Write down allowed source states and authorization.
4. Inspect production schema; do not guess enum values.
5. Define/adjust Zod transport input.
6. Implement the application command and transaction.
7. Lock/read the appointment in its workspace.
8. Validate the transition.
9. Update authoritative state.
10. Publish `appointment.cancelled` in the same transaction with immutable cancellation facts.
11. Keep email/calendar behavior out of the command; consumers handle those after commit.
12. Add tests for authorization, invalid state, retry/idempotency, transaction rollback and event publication.
13. Run the actual verification commands.
14. Review the diff.
15. Commit with a precise subject.
16. Update BuildOS evidence without overstating verification.

If you cannot explain why a line belongs in its layer, reconsider the design before adding it.

## 25. The standard

A first-project developer should be able to learn professional backend engineering from this repository. An experienced developer should find the code unsurprising, explicit and easy to audit.

Prefer boring correctness over clever abstraction. Prefer explicit invariants over convention. Prefer evidence over confidence. Preserve the human business workflow, keep side effects outside the transactional core, and make failure behavior as carefully designed as the happy path.
