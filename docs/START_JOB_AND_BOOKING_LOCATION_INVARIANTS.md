# Appointment workflow invariants

These are release-blocking invariants for public bookings and job execution.

1. A public booking cannot create an appointment without an appointment-owned service location.
2. A public booking address is never written to or inferred from the customer profile.
3. Appointment start uses the same canonical atomic job-transition path as the technician app.
4. Transitioning an appointment into `in_progress` stamps `dispatch_status=started` and `actual_start_time` in the same database transaction.
5. When a technician starts an assigned appointment, technician presence moves to `on_job` in the same transaction; an unassigned technician cannot start it.
6. Inspection-gate read failures never mean “no inspection required.” Completion stays blocked until required inspection state is successfully verified.
7. Historical appointments lacking an appointment-owned location must be repaired from a trusted source, never from a customer-address fallback.

Any future booking, dispatch, appointment-detail, technician, payment, or import path that creates or transitions appointments must preserve these invariants.
