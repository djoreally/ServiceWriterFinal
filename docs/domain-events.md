# Domain Event Contract

Service Writer uses an orchestrated domain core and choreographed side effects.

## Command boundary

Lifecycle transitions happen only through explicit application commands. Events do not silently advance appointments, work orders, quotes, invoices, or payments.

## Atomic publication

A command that changes authoritative domain state must insert its immutable domain event and delivery record inside the same PostgreSQL transaction. If either write fails, the command rolls back.

## Payload rule

Include aggregate identifiers and immutable point-in-time facts whose historical meaning would be lost if a consumer re-read mutable tables later. Do not serialize entire mutable aggregates by default.

## Delivery semantics

Delivery is at-least-once. Workers claim bounded batches using FOR UPDATE SKIP LOCKED. Processing leases expire and are reclaimable. Retryable failures return to pending with exponential backoff. Exhausted events move to dead_letter.

LISTEN/NOTIFY is a wake-up optimization only. A periodic reconciliation drain is mandatory.

## Consumer semantics

Each external side effect is tracked by event_id + consumer_name. Prefer provider-native idempotency using that stable key. When a provider cannot guarantee idempotency and the process dies after the provider accepted a request but before local confirmation, record the result as ambiguous rather than blindly asserting success.

## Tracing

trace_id follows the inbound request or job.
correlation_id groups a business operation across events.
causation_id identifies the event that caused another event.

## Core-state protection

Email, SMS, calendar, analytics, webhook and notification consumers do not own core lifecycle transitions. Any workflow requiring a domain transition must invoke the relevant application command.
