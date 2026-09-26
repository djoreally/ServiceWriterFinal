# Feature modules

Every retained Service Writer capability is implemented as a feature module. New business behavior belongs here rather than in route handlers or generic server folders.

Each module may expose only deliberate public entrypoints. Internal folders follow: domain, application, infrastructure, ui. Infrastructure implements ports owned by the application/domain layer. UI and Hono transport depend on public application contracts, never the reverse.

Initial module set: dashboard, booking, customers, vehicles, services, appointments, work-orders, quotes, invoices, payments, settings.
