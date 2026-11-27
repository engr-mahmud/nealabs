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
- **Phone verification is required** (owner decision, 2026-11-26). Sign-up asks for a Saudi mobile; a 6-digit SMS code must be entered before any company can be created or joined. Codes: random, stored hashed, valid 10 minutes, 5 wrong tries then a new code is needed, 60-second resend wait. SMS sending is limited to 5 per account and per number and 20 per IP each hour, because SMS costs money.
- The number entered at sign-up is kept as `pendingPhone` (not unique) and only becomes the account's `phone` (unique) after the code is verified. So nobody can block a number they do not own by typing it first.
- Only Saudi mobile numbers (+9665XXXXXXXX) are accepted for now. Arabic digits and formats like 05..., +966..., 00966... are all accepted.
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
- **One 7-day free trial per account with a new email and a new verified mobile number** (owner decision, 2026-11-26). No card needed. The trial starts when the account creates its first company; companies the same account adds later share the same end date (they do not get a new 7 days).
- Reuse is blocked twice: the verified phone and the email are unique per account, and every trial is also recorded in `trial_claims` (phone and email). A number or email found there gets no new trial, even if the old account is removed in future. Such a company starts in read-only mode with the "Choose a plan" prompt.
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

## SMS
- One `sendSms()` function behind `SMS_TRANSPORT`: `console` (development, prints the code in the server log), `unifonic` (default choice for production: Saudi provider with local sender name support) or `twilio` (fallback). Switching provider is an env change.
- Saudi Arabia requires a registered SMS sender name, done through the provider. The Unifonic request format in `src/lib/sms.ts` must be checked against Unifonic's current API docs with a real account before launch; it has not been tested against the live service.

## Email
- `nodemailer` over SMTP, so any provider works (portable). `EMAIL_TRANSPORT=console` prints emails to the server log for local development only.

## Hosting and data
- Demo/testing: Vercel + Neon free tier (**no real worker data there**). Production: VPS or cloud region in Saudi Arabia/Gulf with Docker (`Dockerfile`, `docker-compose.yml`).
- Backups: `scripts/backup.sh` (pg_dump custom format, verified, optional rclone copy off-server). Because of `FORCE ROW LEVEL SECURITY`, backup and restore run with `app.bypass_rls=on`; tested end to end.

## Known dev-only advisory
- `npm audit` reports a high-severity advisory in `effect`, pulled in by the Prisma CLI (`prisma` dev dependency, config parsing). It is not part of the running app. Re-check when Prisma releases a fix.

## Master data (step 2, 2026-11-27)
- **Clients, Sites, Workers** are tenant tables with RLS like the others. A site points to its client and a worker to its site through **composite foreign keys (id + organizationId)**, so the database itself refuses a link to another company's record, even outside the app code.
- **Nothing is deleted.** Clients, sites and workers are archived and can be restored. Archiving a client also archives its sites. Workers keep their (archived) site for history.
- **Duplicates:** active client names are unique per company (case-insensitive); site names unique per client; Iqama unique per company (also across archived workers).
- **Iqama and passport numbers are encrypted at rest** with AES-256-GCM (`src/lib/field-crypto.ts`, key `FIELD_ENCRYPTION_KEY`, versioned `v1:` format for future key rotation). For duplicate checks and exact search a keyed HMAC per company is stored, plus the last 4 digits for masked display ("•••• 1234"). Full numbers never go to list pages, URLs, logs or audit metadata; showing one is a button that writes `worker.document_viewed` to the audit log. The edit form never receives the full number (empty field = keep). The Excel export and the JSON data export contain full numbers (it is the customer's data) and are audited.
- **Losing `FIELD_ENCRYPTION_KEY` means losing the numbers.** Back it up outside the database backups.
- Iqama format: 10 digits starting with 2 (resident) or 1 (Saudi ID). **Please verify against official sources**; easy to change in `src/features/workforce/schemas.ts`.
- **Salary fields:** basic, housing, transport and other allowance, monthly, integer halalas. Salary changes are written to the audit log with old and new amounts (step 5 builds on these).
- **Expiry:** dates are stored as dates (no time). "Today" is the Saudi calendar day (Asia/Riyadh). "Expiring soon" = within 30 days (`src/config/master-data.ts`). Reminder emails go to every Owner and Accountant at 30, 14, 7, 1 and 0 days, at most one email per company per day (dedupe key in `rate_limits`). Emails contain names and dates only.
- **Excel import:** `.xlsx` only (checked by file signature), max 2 MB and 2,000 rows. Columns are matched by header (English or Arabic, any order). Step 1 checks every row and shows errors per cell without saving; step 2 sends the same file again and the server re-checks everything (the preview is never trusted), then saves the valid rows in one transaction and skips the rest. Sites are matched to clients by name; workers to sites by site name (plus client name when two clients have a site with the same name). Template, import and export share the same columns, so an export can be edited and re-imported.
- **Lists** use plain GET search forms (work without JavaScript, shareable URLs), 50 rows per page.

## Sales documents (step 3, 2026-11-27)
- **One table for quotations, proformas and tax invoices** (`sales_documents`, type column), with lines and payments in their own tables. All tenant tables with RLS, composite foreign keys to client/site/document so the database refuses cross-company links, and CHECK constraints so totals always add up (`total = subtotal - discount + VAT`, `paid <= total`).
- **Money:** integer halalas. Quantities are integer thousandths (7.5 hours = 7500), so no floats anywhere. Rounding is half up: once per line (qty × price), once for the discount, and **VAT is calculated once on the document's taxable total**, not per line. The same pure function (`features/sales/totals.ts`) runs in the form preview and on the server; the server always recomputes.
- **Discount:** one per document, percent or SAR amount, applied before VAT. No per-line discount in the MVP.
- **VAT rate** 15% from `src/config/sales.ts`, stored on each document for history. Zero-rated / exempt lines are not supported yet (they need reason codes; decide before Phase 2).
- **Numbering:** separate series per company: `QT-00001`, `PI-00001`, `INV-00001` (prefixes in `src/config/sales.ts`). A counter row per company and type is incremented with an atomic upsert, so parallel requests never get the same number (tested). Quotations and proformas get their number when saved. **Tax invoices are numbered only when issued**, so deleted drafts leave no gaps in the invoice series.
- **Draft → issue:** a tax invoice is a draft (editable, deletable, "DRAFT – not a tax invoice" on print) until "Issue invoice". Issuing sets the number, today's date (Saudi time) and the exact timestamp used in the QR, freezes the seller and buyer details, and locks it forever. Issuing requires the company VAT number. Corrections after issue are made with credit notes (below).
- **Snapshots:** seller (company) and buyer (client) details are copied onto the document as JSON, so later edits of the company or client do not change old documents. The logo on print is the current logo.
- **Conversion:** quotation → proforma or invoice, proforma → invoice; copies client, site, lines, discount, notes. Each document converts once (unique `sourceId`); a converted document is locked. Converting to an invoice creates a draft to review, then one click to issue. Deleting that draft frees the source to convert again.
- **Status:** only DRAFT/SENT is stored. Paid / partly paid / overdue are derived from `paidAmount`, `total` and `dueDate`, so they can never be out of sync. "Overdue" wins over "partly paid" (it needs action).
- **Payments** only on issued invoices; a conditional update makes overpayment impossible even with parallel requests. A wrong payment can be removed; the audit log keeps the amount and who removed it. Every money action (create, update, issue, convert, payment added/removed, draft deleted) is in the audit log. Step 4 will turn payments into income.
- **Standard vs simplified:** an invoice to a client with a VAT number prints as "Tax Invoice / فاتورة ضريبية", without one as "Simplified Tax Invoice / فاتورة ضريبية مبسطة". **Please verify this rule against ZATCA guidance for your customers.**
- **ZATCA Phase 1 QR:** TLV (tag, 1-byte length, UTF-8 value) for seller name, VAT number, timestamp (UTC ISO 8601), total with VAT, VAT amount, Base64. The seller name used is the Arabic company name if entered, otherwise English. Tested against the commonly published example payload and decoded from a real generated PDF. **Verify against ZATCA's current "E-Invoicing Detailed Guidelines" before launch** (https://zatca.gov.sa). Phase 2 (Fatoora integration, cryptographic stamp, XML) is a later step.
- **Print and PDF:** one HTML renderer (`features/sales/document-html.ts`, every value escaped) for both. Labels are bilingual; the chosen language (EN or AR/RTL) leads. PDFs come from headless Chromium via `playwright-core` (correct Arabic shaping, checked visually); fonts (Inter, IBM Plex Sans Arabic) are embedded so the server needs no system fonts. JavaScript and network are off while rendering. On Vercel the PDF route needs a serverless Chromium (not set up); the print view works everywhere.
- **Arabic line descriptions** are optional per line (checkbox in the form).
- **Credit notes** (decided 2026-11-27: build before launch, since an issued invoice can never be edited or deleted). A credit note is a `CREDIT_NOTE` document linked to one issued tax invoice (composite FK, same company). It starts as a draft with the invoice's lines, which the user lowers to what is credited, plus a required reason. Client, site and VAT rate always come from the invoice. Issuing gives it its own series (`CN-00001`, numbered on issue, no gaps), the issue time and a Phase 1 QR (with the credit note's own total and VAT), and locks it. Several credit notes per invoice are allowed, but their issued total can never exceed the invoice total (checked in one atomic update, tested with parallel requests).
- **Invoice balance** is stored as `balance = max(0, total - paid - credited)` and enforced by a database CHECK. Payments are limited to the balance. An invoice whose balance is 0 shows "Paid", or "Credited" when credit notes cover the whole total. If a credit note is issued after full payment, the money owed back to the client is not tracked yet (refunds come with step 4 finance).
- Debit notes (to increase an issued invoice) are not built; issue a new invoice for extra work instead.

## Open questions
1. ~~Trial per company or per user?~~ Answered: one trial per new email + phone, verified by SMS.
2. SMS provider account: Unifonic (recommended) or Twilio, plus a registered sender name.
3. Email verification on sign-up: required before first invoice, or not at all for MVP?
4. Which SMTP provider for production email (needs a sending domain)?
5. Final product name and brand color.
6. Plan limits (workers, invoices) and SAR prices.
7. Are 30 / 14 / 7 / 1 / 0 days the right reminder days for Iqama and passport renewals? Should reminders also go by SMS (costs money)?
8. ~~Credit notes before launch?~~ Answered: yes, built in step 3.
9. Default payment terms (30 days) and quotation validity (15 days): right for your customers?
