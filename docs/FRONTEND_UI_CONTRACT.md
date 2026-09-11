# Service Writer Frontend UI Contract

This is the canonical frontend styling contract for the authenticated Service Writer application. Product behavior, domain logic, API contracts, RLS, payments, booking, and persistence are independent of this presentation layer.

## Design rules

1. **One visual system.** Internal application screens use the shared tokens and primitives in `src/index.css`, `src/material-color-system.css`, `src/components/ui`, and `src/components/layout/PagePrimitives.tsx`.
2. **Color has meaning.** Blue is the only non-semantic accent. Green means successful/completed/paid, amber means warning/pending, and red means destructive/failed/overdue. Decorative gradients do not belong in authenticated operational surfaces.
3. **Consistent geometry.** Controls, cards, panels, dialogs, tabs, and navigation use the canonical radius and spacing scale. Local one-off radii are exceptions, not a second design system.
4. **Hierarchy before decoration.** A page has one primary heading, restrained secondary copy, clear section headings, and a small set of primary KPIs. Do not make every card equally loud.
5. **Tables are for scanning.** Text aligns left; numeric and monetary columns align right and use tabular numerals; headers are restrained; rows use subtle hover/selection states; status badges stay compact.
6. **Forms stay legible.** Labels remain visible. Related fields are grouped. Validation appears at the field or section that failed. Saving, loading, disabled, and destructive states must be explicit.
7. **Settings is a system.** Settings uses a single category navigation rail and a single content surface. Do not add a second tab strip or duplicate category dashboard.
8. **Empty/loading/error states are deliberate.** No blank panels. Every empty state says what is missing and, when actionable, offers one clear next action.
9. **Mobile is recomposed.** Do not merely squeeze desktop layouts. Preserve 44px touch targets, readable totals, safe-area spacing, and intentional table overflow/card transformations.
10. **Theme is personal.** Theme preference is scoped to the authenticated user. New users default to the operating-system preference.
11. **Text and data are the focal point.** Authenticated operational UI does not use decorative icons beside field names, card titles, navigation labels, or ordinary actions. Icons are reserved for meaning that text alone does not express efficiently: directional trends, disclosure/chevrons, status, warnings, and universally understood utility controls.
12. **Frontend is replaceable.** Business rules and data access do not belong in styling primitives. A future frontend can be replaced without changing the canonical backend contracts.

## Canonical primitives

- `PageContainer`, `PageHeader`, `PageToolbar`, `Section`, `Panel`, `ResponsiveGrid`, `EmptyState`, `StickyActionBar`
- shadcn-based `Button`, `Card`, `Table`, `Input`, `Textarea`, `Select`, `Dialog`, `Tabs`, `Badge`
- semantic CSS variables in `src/index.css` and the tonal brand family in `src/material-color-system.css`

## Review gate

A frontend change fails review when it introduces a second color/radius/spacing language, decorative operational gradients, hidden form labels, duplicate navigation destinations, non-semantic status colors, global cross-user theme persistence, or a new one-off primitive where a canonical primitive already exists.

Marketing/public pages may intentionally use a separate campaign art direction. This contract governs the authenticated operating product.
