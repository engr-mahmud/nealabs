# Decisions

Short record of choices made, with the reason. Update when a decision changes.

## Stack
- **Next.js 16 (App Router) + TypeScript (strict), Tailwind CSS 4, Prisma 7, PostgreSQL 16.** Current stable versions at the time of step 1 (Nov 2026). Prisma 7 uses the `@prisma/adapter-pg` driver adapter and `prisma.config.ts`.
- **UI primitives are written in-repo** (`src/components/ui`) in the shadcn style, without Radix. Fewer dependencies, faster pages. Add Radix later only for complex widgets (combobox, dialog).
- **Fonts are self-hosted** via `@fontsource` (Inter + IBM Plex Sans Arabic). No call to Google Fonts at build or run time, which also keeps data in-region.
- **No `proxy.ts` (middleware).** Every page and action checks the session itself through `requireOrgPage()` / `requireOrgAction()`. One place to reason about auth, and no edge runtime.

## Naming and brand
- Product name, umbrella brand, logo, accent color, support email, WhatsApp number and data location live in `src/config/brand.ts`. The product name is a placeholder: **"NeaLabs Manpower"**.
- Customers see their own company name and logo in the header; NeaLabs is only a "Powered by" line.

## Auth
- **Own auth, no third-party library.** Email + password, argon2id (OWASP parameters), opaque 256-bit session token in an httpOnly, SameSite=Lax cookie; only the SHA-256 hash is stored in the `sessions` table.
- Sessions last 30 days (absolute, not sliding). Password reset signs the user out everywhere.
- Reset links: single use, 1 hour, previous links cancelled when a new one is requested. The "forgot password" answer is identical whether the email exists or not.
- Rate limits are stored in PostgreSQL (works on Vercel and on one VPS without Redis): login 10 per email and 30 per IP per 15 min; sign-up 10 per IP per hour; reset 3 per email per hour.
- CSRF: Next.js Server Actions check the Origin header; cookies are SameSite=Lax; the only GET endpoints (export, logo) do not change data.
- Not in MVP: email verification, 2FA, "remember me" choice, social login. Open question below.

## Multi-tenancy
- Shared database, `organizationId` on every tenant table. The active organization is stored on the **server-side session**, never read from the client. It is re-checked against `memberships` on every request.
- **PostgreSQL Row Level Security** on tenant tables (`invitations`, `subscriptions`, `audit_logs`, and every tenant table added later). `tenantDb(orgId)` sets `app.org_id` for each query inside a transaction; `systemDb()` sets `app.bypass_rls` and is used only where the token itself is the authorization (invitation links) or for system jobs. With neither set, tenant tables return nothing (fails closed).
- `FORCE ROW LEVEL SECURITY` is on, so the policies apply to the table owner too. **The app must not connect as a superuser or a BYPASSRLS role** (superusers skip RLS). The app logs an error at startup if it does.
- Tables that are not tenant data (`users`, `sessions`, `organizations`, `memberships`) are protected in the data-access layer instead, because a user legitimately reads across organizations (the company switcher).
- **Each new step must:** add `organizationId` + an RLS policy in the migration, access the table only via `tenantDb` / `tenantTransaction`, and add a cross-tenant test.

## Roles
- **Owner:** everything, including company settings, team, billing.
- **Accountant:** business data (clients, invoices, workforce, salaries, finance), read and export. No company settings, team or billing.
- Permissions live in one map: `src/features/organizations/permissions.ts`.

## Trial and read-only mode
- Every new organization gets a 7-day trial (`TRIAL_DAYS`), no card. One user can own several organizations; **each organization gets its own trial** (see open questions).
- Access is **computed from the subscription and the clock** on every request (`computeAccess`), so read-only starts the moment the trial ends, without a cron job.
- Read-only blocks all writes (`assertCan`) but always allows viewing, **data export**, and billing (so the owner can subscribe again). Data is never deleted.
- `PAST_DUE` keeps working for 3 days after the period end, then read-only. `CANCELED` works until the paid period ends.

## Organizations
- Company logo: PNG/JPG/WEBP up to 512 KB, type checked by magic bytes (SVG rejected: it can carry scripts). Stored in PostgreSQL (`organization_logos`) to avoid a storage vendor; served only to members.
- Validation: CR = 10 digits; VAT = 15 digits starting and ending with 3; IBAN = `SA` + 22 digits with mod-97 check. Arabic-Indic digits are accepted. **Please verify the CR and VAT formats against official ZATCA / Ministry of Commerce sources before launch.**
- Organizations are never hard-deleted (`archivedAt` for later).
- Invitations are bound to the invited email, valid 7 days, single use.

## Billing (prepared in step 1, built in step 7)
- Plans and prices in `src/config/plans.ts`, integers in halalas, excluding VAT. **Prices (Starter 99, Pro 199, Business 399 SAR/month) are placeholders** to validate with first customers.
- Quarterly = monthly x 3. Yearly = monthly x 10 ("2 months free"). Tested.
- Plan or cycle changes: apply at next renewal (no proration) unless the gateway makes proration simple. Decide in step 7.
- Until payments are live, the billing page links to WhatsApp.

## Email
- `nodemailer` over SMTP, so any provider works (portable). `EMAIL_TRANSPORT=console` prints emails to the server log for local development only.

## Hosting and data
- Demo/testing: Vercel + Neon free tier (**no real worker data there**). Production: VPS or cloud region in Saudi Arabia/Gulf with Docker (`Dockerfile`, `docker-compose.yml`).
- Backups: `scripts/backup.sh` (pg_dump custom format, verified, optional rclone copy off-server). Because of `FORCE ROW LEVEL SECURITY`, backup and restore run with `app.bypass_rls=on`; tested end to end.

## Known dev-only advisory
- `npm audit` reports a high-severity advisory in `effect`, pulled in by the Prisma CLI (`prisma` dev dependency, config parsing). It is not part of the running app. Re-check when Prisma releases a fix.

## Open questions
1. Should each new company get a fresh 7-day trial, or only the user's first company? (Current: every company.)
2. Email verification on sign-up: required before first invoice, or not at all for MVP?
3. Which SMTP provider for production email (needs a sending domain)?
4. Final product name and brand color.
5. Plan limits (workers, invoices) and SAR prices.
