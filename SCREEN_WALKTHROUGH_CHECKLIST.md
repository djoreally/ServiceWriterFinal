# Service Writer Production Screen Walkthrough Checklist

## Public and authentication screens

- `/`
- `/how-it-works`
- `/features-guide`
- `/pricing`
- `/find-provider`
- `/faqs`
- `/contact`
- `/about`
- `/advertising-network`
- `/partner-program`
- `/white-glove-onboarding`
- `/blog`
- `/blog/all-features-showcase`
- `/insights`
- `/careers`
- `/support`
- `/knowledge-base`
- `/privacy-policy`
- `/terms`
- `/security`
- `/login`
- `/login/business`
- `/login/dispatch`
- `/login/technician`
- `/login/magic-link`
- `/admin/login`
- `/signup`
- `/forgot-password`

## Business-owner and operations screens

- `/dashboard`
- `/onboarding`
- `/appointments`
- `/command-center`
- `/customers`
- `/vehicles`
- `/service-catalog`
- `/payments`
- `/financials`
- `/settings`
- `/growth-tools?tab=email-testing`
- `/detailing-pricing`
- `/tire-pricing`

## Fleet and team screens

- `/fleet-os`
- `/fleet-os/contracts`
- `/fleet-os/scheduler`
- `/team-os`
- `/customer/dashboard`

## Technician screens

- `/tech-app`

## API and backend surfaces

The repository also exposes health, identity, workspace, customer, vehicle, appointment, dispatch, work-order, service-record, quote, invoice, payment, CRM, import, invitation, public-booking, service-catalog, webhook, and checklist API routes under `/api/v1/`. These will be checked through code review and safe unauthenticated health/public endpoints where appropriate; destructive mutations will not be run without explicit approval.

## Status key

Each screen will be marked **Pass**, **Pass with warning**, **Blocked by authentication/provider state**, or **Fail**, with its intended purpose and observed behavior recorded.

## Initial observations

The live public route probe returned HTTP 200 for all inventoried marketing and authentication routes. The `/pricing` screen clearly presents Pay As You Grow, Starter, Shop, and Fleet plans with create-account or demo actions. The `/features-guide` screen presents Booking & Scheduling, Dispatch & Fleet Operations, Payments & Invoicing, Customer & Vehicle History, Growth Tools, Reporting & Retention, Technician OS, and AI Assistant as the principal product areas. The `/dashboard` route correctly enforces authentication by returning the sandbox browser to `/login` when no session is present.

The `/find-provider` screen serves customer discovery: it offers a city, state, or ZIP search field and a Search action, with an empty-state message explaining that providers will appear for the selected area. The `/contact` screen serves sales and support leads: it exposes the hello@servicewriter.xyz email, US business-hours support text, a demo link, and a form for name, email, company, and message that opens a prefilled email draft rather than submitting directly to the application backend. Both screens rendered without visible errors.

The `/faqs` screen is a customer-facing pre-sales information surface. It renders an accordion with questions about target users, competitive differentiation, offline operation, payment processing, online booking, free trials, and data storage; the first item was visibly expanded and the remaining items were interactive buttons. No rendering error was observed.

The FAQ accordion interaction passed: clicking the second question collapsed the first answer and expanded the selected answer, which displayed its explanatory text without a navigation or rendering failure.

The `/login` screen is the role-selection gateway for Business Owner, Dispatch & Office Staff, Technician, and Platform Admin users, with separate role routes plus magic-link signup access. The `/login/business` screen renders Google sign-in, email/password sign-in, magic-link login, password recovery, role switching, and account creation. No visual errors were observed in either screen.

The `/login/dispatch` and `/login/technician` screens both render the same authentication affordances as the business-owner screen while changing the role label and purpose: dispatch/office staff are described as running the daily board, and technicians are described as using the field app. Both include Google sign-in, email/password, magic-link login, password recovery, role switching, and account creation. No visible errors were observed.

The `/signup` screen is a business-owner workspace creation form with email and password fields, a Create account action, role switching, and sign-in fallback. It rendered correctly and was not resubmitted during this walkthrough. The `/forgot-password` screen is a recovery form with one email field and a Send reset link action; it rendered correctly. Earlier production testing confirmed the reset flow returns a generic success response and can establish a session through a single-use Supabase recovery link.

The `/login/magic-link` screen provides passwordless authentication with a single email field and a clear “Email me a magic link” action, plus a password-login fallback. The `/admin/login` screen is intentionally separate and restricted to platform administrators; it renders email and password fields, a Sign In action, and an explicit restriction notice. Neither screen showed a rendering error.

The `/how-it-works` screen explains the end-to-end operating flow from booking and dispatch through field service, invoicing, and retention. The `/about` screen communicates the product positioning and operating model. The `/security` screen renders a security overview with RBAC, TLS, audit logging, incident response, and vulnerability-reporting content. The `/support` screen renders correctly but explicitly states that live support chat is not configured; this is a product-configuration gap rather than a rendering failure.

The `/privacy-policy` and `/terms` screens render substantive legal templates with April 5, 2026 effective dates, privacy/data-processing coverage, account responsibilities, billing, intellectual property, termination, and jurisdictional language. Both explicitly state that counsel review is needed before legal publication. The `/blog` screen renders categories and a featured article, but explicitly states that in-app newsletter signup is not available yet. The `/insights` screen renders operational content categories and a featured dispatch article, but its Subscribe action was not exercised because no destination or form was exposed in the extracted screen content.

The `/advertising-network` screen is a detailed marketplace and collective-advertising explanation for independent automotive providers, including eligibility, matching, territory, reporting, and disclaimer content. The `/white-glove-onboarding` screen explains a managed setup service covering catalog, scheduling, payments, branding, communications, and team permissions. The `/careers` screen presents future roles and contact paths, while explicitly stating that there is no formal hiring process today. The `/partner-program` screen renders a minimal headline and positioning statement but no visible partner application form or next-step action beyond the global navigation; this should be treated as a content-completeness gap.
