# Service Writer — Endpoint Map

> Generated 2026-10-10. Frontend-only reference: what the UI can call, what each returns, what it needs.
> Backend code untouched. This map is the foundation for the frontend redesign.

## How to read this

- **Route** — the HTTP path (Hono router mounted at `/api/[[...route]]`)
- **Needs** — required params/headers (all workspace-scoped routes need `workspace_id` + auth session unless noted)
- **Returns** — shape of the response
- **Used by** — frontend screens/components that call it

---

## 1. Appointments

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/appointments` | GET | `workspace_id`, filters | Appointment list | Appointments list, DispatchBoard, tech job list |
| `/v1/appointments` | POST | `workspace_id`, booking payload | Created appointment | Booking flow, manual create |
| `/v1/appointments/:id` | GET | `workspace_id` | Appointment + relations (customer, vehicle, services, payments) | AppointmentDetail |
| `/v1/appointments/:id` | PATCH | `workspace_id`, partial | Updated appointment | EditAppointmentDialog |
| `/v1/appointments/:id` | DELETE | `workspace_id` | Deleted confirmation | AppointmentDetail (admin) |
| `/v1/appointments/:id/start` | POST | `workspace_id` | Calls `start_appointment_job_v1` RPC → job started | **Tech: Start Job button** |
| `/v1/appointments/:id/complete` | POST | `workspace_id` | Calls `complete_appointment_v1` → completed | **Tech: Complete Job** |
| `/v1/appointments/:id/confirmation` | POST | `workspace_id` | Confirmation sent | AppointmentDetail |
| `/v1/appointments/:id/technician-status` | GET/POST | `workspace_id` | Tech dispatch status transitions | MobileDispatchView |
| `/v1/appointments/service-catalog` | GET | `workspace_id` | Service catalog for booking | Booking flow |
| `/v1/appointments/scheduling-settings` | GET | `workspace_id` | Scheduling rules, buffers | Booking flow |
| `/v1/appointments/service-lines` | GET | `workspace_id`, appointment_id | Service line items | AppointmentDetail services tab |
| `/v1/appointments/dispatchable` | GET | `workspace_id` | Appointments ready to dispatch | DispatchBoard |
| `/v1/appointments/day-appointments` | GET | `workspace_id`, `date` | Day's appointments | Calendar/DayCalendarView, tech daily list |
| `/v1/appointment-items` | GET/POST | `workspace_id` | Appointment line items | AppointmentDetail |

### Key RPCs (appointments)
| RPC | Args | Returns | Used by |
|---|---|---|---|
| `start_appointment_job_v1` | `p_workspace_id`, `p_appointment_id`, `p_idempotency_key` | jsonb (job state) | Start Job button |
| `complete_appointment_v1` | `p_workspace_id`, `p_appointment_id` | uuid | Complete Job |
| `complete_appointment_closeout_v1` | `p_workspace_id`, `p_appointment_id` | jsonb | Closeout flow |
| `technician_transition_job_v1` | `p_job_id`, `p_source`, `p_next_status`, `p_notes` | jsonb | MobileDispatchView status buttons |
| `assign_dispatch_job_v1` | `p_workspace_id`, `p_job_source`, `p_job_id`, `p_technician_id` | jsonb | DispatchBoard assign |
| `get_tech_fleet_assignments_v1` | `p_technician_id` | jsonb | Tech fleet job list |
| `cancel_customer_appointment_v2` | `p_appointment_id`, `p_cancellation_reason` | jsonb | Cancel flow |
| `reschedule_customer_appointment_v2` | `p_appointment_id`, `p_new_date`, `p_new_time` | jsonb | Reschedule flow |
| `set_technician_presence_v1` | `p_workspace_id`, `p_status`, `p_appointment_id` | jsonb | Tech clock in/out |
| `clock_technician_v1` | `p_workspace_id`, `p_action`, `p_location` | jsonb | TimeClock |

---

## 2. Work Orders

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/work-orders` | GET | `workspace_id` | Work order list | Work orders list |
| `/v1/work-orders` | POST | `workspace_id`, WO payload | Created work order | Create WO flow |
| `/v1/work-orders/:id` | GET | `workspace_id` | WO + chain (services, parts, fluids, inspection) | WO detail drawer |
| `/v1/work-orders/checklist/advance` | POST | `workspace_id` | Checklist advanced | Tech checklist |
| `/v1/work-orders/checklist/items/:itemId` | PATCH | `workspace_id` | Item updated | Tech checklist |
| `/v1/operational-jobs` | GET | `workspace_id` | Operational job list | CommandCenter |
| `/v1/jobs/:id/runtime` | GET | `workspace_id` | Job runtime state | Tech job view |
| `/v1/fleet/work-orders` | GET | `workspace_id` | Fleet work orders | Fleet views |
| `/v1/fleet/dispatcher-work-orders` | GET | `workspace_id` | Dispatcher WO view | DispatchBoard |

---

## 3. Dispatch

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/dispatch/assign` | POST | `workspace_id`, job_id, technician_id | Assignment created | DispatchBoard |
| `/v1/dispatch-events` | GET | `workspace_id` | Dispatch event stream | DispatchBoard realtime |
| `/v1/command-center` | GET | `workspace_id` | Command center data | CommandCenter |
| `/v1/command-center/technicians` | GET | `workspace_id` | Tech list + status | CommandCenter, DispatchBoard |

---

## 4. Customers & Vehicles

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/customers` | GET | `workspace_id`, search | Customer list | Customers page |
| `/v1/customers` | POST | `workspace_id` | Created customer | New customer |
| `/v1/customers/:id` | GET | `workspace_id` | Customer 360 | CustomerDetail |
| `/v1/customers/:id/summary` | GET | `workspace_id` | Customer summary | Customer cards |
| `/v1/vehicles` | GET | `workspace_id`, search | Vehicle list | Vehicles page |
| `/v1/vehicles` | POST | `workspace_id` | Created vehicle | New vehicle |
| `/v1/vehicles/:id` | GET | `workspace_id` | Vehicle detail | Vehicle detail |
| `/v1/vehicles/:id/summary` | GET | `workspace_id` | Vehicle summary | Vehicle cards |
| `/v1/fleet/vehicles/:id` | DELETE | `workspace_id` | Deleted | Fleet views |
| `/v1/fleet/contacts` | GET/POST | `workspace_id` | Fleet contacts | Fleet views |
| `/v1/fleet/contracts` | GET/POST | `workspace_id` | Fleet contracts | Fleet views |
| `/v1/service-records` | GET/POST | `workspace_id` | Service history | Vehicle 360 |

---

## 5. Invoices & Payments

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/invoices` | GET | `workspace_id` | Invoice list | Invoices page, Financials |
| `/v1/invoices` | POST | `workspace_id` | Created invoice | Create invoice |
| `/v1/invoices/:id` | GET | `workspace_id` | Invoice + line items | Invoice detail |
| `/v1/invoices/:id` | PATCH | `workspace_id` | Updated | Edit invoice |
| `/v1/invoices/:id/send` | POST | `workspace_id` | Sent | Send invoice |
| `/v1/payments` | GET | `workspace_id` | Payment list | Financials |
| `/v1/payments` | POST | `workspace_id` | Recorded payment | Record payment |
| `/v1/appointments/:id/financials` | GET | `workspace_id` | Financial summary | AppointmentDetail |

### Key RPCs (billing)
| RPC | Args | Returns | Used by |
|---|---|---|---|
| `apply_appointment_card_fee_v1` | `p_workspace_id`, `p_appointment_id`, `p_invoice_id` | numeric | Fee calculation |
| `record_fleet_invoice_payment` | `_invoice_id`, `_amount`, `_idempotency_key` | table | Fleet payments |

---

## 6. Public Booking (no auth)

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/public-booking/:slug` | GET | slug | Booking page config | Public booking page |
| `/v1/public-booking/:slug/confirmation` | POST | slug, booking data | Booking confirmed | Booking confirmation |
| `/v1/public-vehicle-catalog` | GET | — | Vehicle catalog | Public booking |

### Key RPCs (public booking)
| RPC | Used by |
|---|---|
| `public_booking_book_appointment_v2/v3` | Public booking submit |
| `public_booking_insert_services_v2` through `v7` | Service selection |
| `get_public_booked_slots_v2` | Availability display |
| `get_public_blocked_dates_v3` | Calendar blocking |
| `get_public_service_catalog_v3` | Service list |

---

## 7. Platform & Identity

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/health` | GET | — | `{ok, service, version}` | Health checks |
| `/v1/identity` | GET | auth | Current user + workspace | App shell |
| `/v1/workspaces` | GET | auth | Workspace list | Workspace switcher |
| `/v1/workforce-identity` | GET | auth | Tech/dispatcher identity | Tech app auth |

---

## 8. Messaging & Notifications

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/shop-agent/agentphone` | POST | signed | AgentPhone integration | Phone |
| `/v1/webhooks/twilio` | POST | Twilio sig | SMS webhook | SMS |
| `/v1/webhooks/twilio/inbound` | POST | Twilio sig | Inbound SMS | SMS |

---

## 9. Catalog & Inventory

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/catalog/items` | GET | `workspace_id` | Catalog items | Parts, services |
| `/v1/service-catalog` | GET | `workspace_id` | Service catalog | Booking, WO |
| `/v1/inventory/overview` | GET | `workspace_id` | Inventory levels | Inventory page |
| `/v1/inventory/shortages` | GET | `workspace_id` | Low stock | Inventory alerts |

---

## 10. CRM

| Route | Method | Needs | Returns | Used by |
|---|---|---|---|---|
| `/v1/crm/profiles` | GET | `workspace_id`, search | Customer profiles | CRM |
| `/v1/crm/activities` | GET/POST | `workspace_id` | Activities | CRM timeline |
| `/v1/crm/campaigns` | GET/POST | `workspace_id` | Campaigns | Marketing |

---

## Tech-App Critical Path (field technician)

The minimum endpoints a tech needs for a full job cycle:

1. **See today's jobs:** `GET /v1/appointments/day-appointments?workspace_id=X&date=today`
2. **Job detail:** `GET /v1/appointments/:id?workspace_id=X`
3. **Go en route:** `technician_transition_job_v1(job_id, 'appointment', 'en_route')`
4. **Arrive:** `technician_transition_job_v1(job_id, 'appointment', 'arrived')`
5. **Start job:** `POST /v1/appointments/:id/start` → `start_appointment_job_v1`
6. **Complete job:** `POST /v1/appointments/:id/complete` → `complete_appointment_v1`
7. **Clock in/out:** `clock_technician_v1(workspace_id, action, location)`

**Total: 7 calls for a complete job.** The redesign must not add more.

---

## Notes

- All `/v1/*` routes go through the Hono router at `app/api/[[...route]]/route.ts`
- Auth: Supabase session cookie; workspace scoping via `workspace_id` param
- 402 RPCs in production; ~35 are tech/appointment/job related (listed above)
- Webhook routes (`/v1/webhooks/*`) are backend-only, not called by frontend
