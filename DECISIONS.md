# Decisions

Short record of choices made, with the reason. Update when a decision changes.

## Stack
- **Next.js 16 (App Router) + TypeScript (strict), Tailwind CSS 4, Prisma 7, PostgreSQL 16.** Current stable versions at the time of step 1 (Nov 2026). Prisma 7 uses the `@prisma/adapter-pg` driver adapter and `prisma.config.ts`.
- **UI primitives are written in-repo** (`src/components/ui`) in the shadcn style, without Radix. Fewer dependencies, faster pages. Add Radix later only for complex widgets (combobox, dialog).
- **Fonts are self-hosted** from `public/fonts` (Inter variable for Latin, IBM Plex Sans Arabic 400/600 for Arabic letters), declared in `globals.css` and preloaded in the root layout (step 7: replaced `@fontsource`, which made Arabic pages load a second Latin font and pushed mobile Lighthouse under 90). No call to Google Fonts at build or run time, which also keeps data in-region.
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

## Billing (step 7)
- Plans and prices in `src/config/plans.ts`, integers in halalas, excluding VAT. **Prices (Starter 99, Pro 199, Business 399 SAR/month) and limits are placeholders** (`PRICES_VALIDATED = false` shows "introductory prices" on the pricing page). Validate with first customers.
- Quarterly = monthly x 3. Yearly = monthly x 10 ("2 months free", saved amount shown on the pricing page and at checkout). VAT 15% is added on the whole cycle price, rounded half up once. Tested.
- **No automatic charges (prepaid periods).** The owner pays each period on a hosted payment page; reminder emails go out 7 and 1 days before the end. Why: mada recurring/tokenized charging needs extra approval from the gateway and banks, and Saudi SMB owners are used to paying per period. Saved-card auto-renewal can be added later behind the same gateway interface.
- **Plan or cycle changes apply at the next renewal, no proration.** The owner picks the plan when paying the renewal. Renewal opens 14 days before the period ends, so at most one future period is prepaid. A renewal paid early keeps the current plan until the current period ends (`scheduledPlanCode` / `scheduledFrom`). Need an upgrade right away: WhatsApp, handled manually.
- Paying during the trial starts the paid period when the trial ends (the customer keeps the free days). Paying within the 3 unpaid grace days continues from the old period end (no free days).
- Access stays computed from dates on each request: ACTIVE past its end gets the 3 grace days (`past_due`), then read-only. A daily job (`/api/cron/billing`) also stores the status changes, rolls over scheduled plans, emails reminders and the "now read-only" notice, and closes checkouts unpaid for 48 hours.
- Plan limits (workers, invoices per month) are **soft** for now: the billing page shows usage and a warning when over the limit, nothing is blocked.
- **Gateway: Moyasar** (mada, Visa/Mastercard, Apple Pay; Saudi company) behind `PaymentGateway` in `src/features/billing/gateway/`. Uses Moyasar's hosted Invoices page, so card data never touches our server (no PCI scope beyond SAQ A). Tap can be added as another implementation of the same interface.
- `PAYMENT_GATEWAY=test` (default) uses a built-in test payment page with "Pay (test)" / "Decline (test)" buttons; a "Test mode" notice is shown on billing pages. No money moves.
- **A payment is never trusted from the browser or the webhook body.** Both the return page and the webhook read the invoice back from Moyasar with the secret key, check status, amount and currency, then apply it. Applying is idempotent and row-locked (webhook and return page can arrive together). An amount mismatch is refused and logged.
- Moyasar webhooks carry the dashboard "Secret Token" in the JSON body (no header signature); it is compared in constant time. A 5xx response makes Moyasar retry.
- **Subscription tax invoices**: issued by the software seller (`src/config/seller.ts`, placeholders to fill) to the customer company, numbered `SUB-00001…` without gaps (counter row in the paying transaction), with seller/buyer snapshot, service period and ZATCA Phase 1 QR. Buyer with a VAT number: tax invoice; without: simplified tax invoice. EN/AR print view and PDF. Tables `billing_checkouts` and `subscription_invoices` have RLS like every tenant table.
- Refunds are done manually in the Moyasar dashboard for now; a credit note for a refunded subscription invoice is not built yet.
- Not verified against a live Moyasar account yet: invoice status values and payment fields were taken from docs.moyasar.com (Nov 2026). Test with a `sk_test_` key before launch.

## Marketing site (step 7)
- Landing page, `/pricing`, `/terms`, `/privacy`, `/refund` in a `(marketing)` route group. Same cookie/Accept-Language locale as the app (no `/ar` URLs yet; add them later if Arabic SEO matters).
- No images: the hero "product preview" is HTML/CSS, icons are inline SVG, FAQ uses `<details>` (no JavaScript). The only client component is the pricing cycle switch. Lighthouse on a local production build: English mobile 92 / desktop 100 performance, Arabic mobile 93; accessibility, best practices and SEO 100. Re-check on the real host.
- Legal pages are **drafts** (`LEGAL_REVIEWED = false` shows a notice) to be checked by a Saudi lawyer. Proposed refund rule: full refund within 7 days of the first paid payment, no refunds on renewals, duplicates/errors always refunded. Owner to confirm.
- WhatsApp: floating button on marketing pages plus a contact section. Number in `src/config/brand.ts`.

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
- **Invoice balance** is stored as `balance = max(0, total - paid - credited)` and enforced by a database CHECK. Payments are limited to the balance. An invoice whose balance is 0 shows "Paid", or "Credited" when credit notes cover the whole total. If a credit note is issued after full payment, the money owed back is recorded as a refund (step 4, below).
- Debit notes (to increase an issued invoice) are not built; issue a new invoice for extra work instead.

## Income and expenses (step 4, 2026-11-27)
- **Two tenant tables** with RLS and composite foreign keys: `finance_categories` and `finance_entries` (income or expense). Amounts are integer halalas **including VAT**, with the VAT part stored separately, so reports can show profit without VAT.
- **Cash basis:** an entry is dated the day money came in or went out. Reports (summary and profit by site) use these dates. Invoices issued but not paid are receivables (Sales page), not income. **Profit is shown without VAT** (VAT collected belongs to ZATCA, VAT paid is reclaimed). The small "VAT in these entries" box is a quick check only, not a VAT return (the return follows invoice dates). Please confirm this approach with your accountant.
- **Invoice payments become income automatically**, inside the same database transaction as the payment, for the invoice's client and site (category "Invoice payments"). Removing the payment removes its income (foreign key ON DELETE CASCADE). The VAT part of each payment is pro rata of the invoice VAT, using the running paid total so that the parts add up exactly to the invoice VAT once fully paid. Payments made before this step are filled in once when the finance pages open.
- **Refunds:** when payments plus credit notes exceed the invoice total, the invoice page shows "Money owed back to the client" and a "Record refund" form. A refund is **negative income** (same category, VAT part pro rata), linked to the invoice, limited to what is owed (invoice row locked, safe with parallel requests). A payment cannot be removed while a refund depends on it. Refunds can be voided from Finance.
- **Manual entries:** amount, category, date (default today), optional site (the client is taken from the site), method, description, reference. A checkbox "amount includes 15% VAT" splits VAT as amount × 15/115; other VAT amounts are not supported yet. Manual entries can be edited (audit log keeps old and new amounts) and **voided, never deleted**; voided entries leave totals and reports but stay visible under "Show voided". Automatic entries are changed only at their source.
- **Categories:** each company gets 2 income and 10 expense defaults (EN/AR names, editable). "Invoice payments" and "Salaries" are used by the app and cannot be archived; "Invoice payments" cannot be chosen for a manual entry (avoids counting a payment twice). Own categories can be added, renamed and archived (archived = hidden from the form, kept in reports).
- **Salary hook for step 5:** `recordSalarySheetExpenses(tx, …)` records an approved salary sheet as one "Salaries" expense per site (re-running replaces the sheet's entries), `removeSalarySheetExpenses` takes them out. `salarySheetId` gets its foreign key when the salary sheet table exists.
- **Database checks:** amount > 0 (only refunds are negative), VAT between 0 and the amount, and each source has exactly its link (payment, invoice or salary sheet).
- **Lists** open on this month with presets (last month, quarter, year, all) or a custom range, filters for type, category and site ("No site" = company overhead), search, and an Excel export of the same filter (allowed in read-only mode).

## Salaries (step 5, 2026-11-27)
- **Tables** `payroll_settings`, `salary_sheets`, `salary_sheet_lines`: tenant tables with RLS and composite foreign keys (sheet, worker, site). **A worker can be on only one sheet per month** (unique index), so one company can make one sheet for all sites or one per site, never paying someone twice.
- **Flow (3 steps):** download the timesheet for a month (and optional site), already filled with the active workers → upload it and see every row checked (red cells, net pay per row) → create a draft. The file is sent again on save and checked again on the server. Rows are linked to workers by a "Worker ref" column (the worker id, not sensitive); a row without it is matched by exact name if unique. Only the last 4 Iqama digits are in the file. "Start with all workers" makes a draft without Excel.
- **Inputs per worker:** unpaid absent days, overtime hours (both may have decimals, stored in thousandths), bonus/additions, advance to deduct, other deductions (halalas). Empty = 0.
- **Calculation** (`features/payroll/calc.ts`, integers only, each amount rounded once, half up):
  gross = basic + housing + transport + other; absence = (absence base) × days ÷ month days (never more than the base);
  overtime per hour = hourly (overtime base) + premium % × hourly basic, hourly = monthly ÷ (month days × hours per day);
  net = gross − absence + overtime + additions − advances − deductions. **Net below 0 is refused** (per row and by a database CHECK); carry the rest of an advance to next month.
- **Default rules (per company, owner can change under Salaries > Payroll rules):** 30-day month, 8 hours a day, overtime = hourly full salary + 50% of hourly basic, absences deducted from the full salary. **This follows our reading of Saudi Labor Law Article 107 (overtime = hourly wage + 50% of basic wage). It is not verified legal advice: please confirm with your accountant / HRSD (https://hrsd.gov.sa) and your contracts, including whether "hourly wage" means basic only or basic + allowances, and the right day basis for absences.**
- **Snapshots:** each line copies the worker's name, last 4 Iqama digits, job, site and salary amounts; the sheet copies the rules. Later edits in Workforce do not change a sheet; "Update salaries from Workforce" refreshes a draft on purpose (inputs are kept).
- **Approve** (Owner or Accountant): needs a pay date, locks the sheet, and in the same transaction records the net pay as "Salaries" expenses, one per site (workers without a site = company overhead), dated on the pay date (cash basis, like step 4). **Advances:** the expense is the net paid now; record an advance as a Salaries expense when you hand it out, so it is not missed or counted twice.
- **Mark as paid** (owner decision 2026-11-27: a separate step after approval). Approval records the expense on the salary date; "Mark as paid" records the day each worker actually got the money, for one worker or all the rest at once, and can be undone. Stored per line (`paidAt`), with the sheet's `paidNet` kept in sync (DB check: never above the net, only on approved sheets). Sheets show Unpaid / Partly paid / Paid; `unpaidSalaries()` gives the dashboard total. Paid date is on the payslip and in the Excel export; every change is in the audit log. A sheet with paid workers cannot be reopened until the paid marks are undone.
- **Reopen** is Owner only: back to draft, its expenses are removed from Finance (audited). Drafts can be deleted (no money recorded); approved sheets cannot.
- **Exports:** salary sheet Excel; salary sheet PDF (A4 landscape, grouped by site with subtotals and signature column); payslips PDF (one A4 page per worker, all or one), EN or AR, from the same HTML renderer and Chromium as invoices; a print view works where PDF is unavailable. Exports are written to the audit log (salary data is personal data).
- Not built yet: an advances ledger carried month to month, WPS/Mudad bank files, GOSI (out of scope).

## Dashboard and reports (step 6, 2026-11-27)
- **Dashboard = six cards, one link each** (`features/dashboard/service.ts` → `dashboardData`): To collect (unpaid balance on issued invoices, overdue count and amount), Pending invoices (draft invoices to issue, proformas and quotations sent but not converted), Unpaid salaries (approved minus "Mark as paid"), this month's income vs expenses (cash basis, without VAT, with last month's profit), Expiring documents (Iqama/passport, expired first), Active sites (+ active workers). The cards reuse the same functions as the full pages (`receivablesSummary`, `financeSummary`, `unpaidSalaries`, `listExpiringDocuments`), so the numbers always match. The setup checklist shows only to the Owner and only the steps not done.
- **"Pending invoices" vs "To collect":** so two cards never show the same number, "To collect" is money owed on issued invoices and "Pending invoices" is sales paperwork waiting for the next step (open question 13).
- **Reports page** (`/app/reports`) gathers all reports: profit and loss by site (step 4 page, unchanged), **money to collect by client** with aging buckets (not due, 1-30, 31-60, 61-90, 90+ days past the due date; no due date = not due), **month by month** (last 12 months, cash basis, without VAT; months before the first entry are hidden), unpaid salaries (salary list with a new "Not fully paid" filter) and expiring documents. Both new reports download as Excel (allowed in read-only mode).
- No new tables or migrations in this step.

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
10. Finance reports are cash basis and without VAT. Is that how you want to see profit, or do you also need an accrual view (by invoice date)?
11. Payroll defaults: is overtime "hourly full salary + 50% of hourly basic" and absence "full salary ÷ 30 per day" right for your workers' contracts? (Changeable per company.)
12. ~~Approve = paid, or a separate paid step?~~ Answered: separate "Mark as paid" step (per worker or whole sheet).
13. Dashboard "Pending invoices" shows drafts to issue and quotations/proformas not yet invoiced. Is that what you need, or did you mean unpaid invoices? (Unpaid money is already the "To collect" card.)
14. Refund rule in the draft Refund Policy (7 days after the first payment, no refunds on renewals): OK for you?
15. Seller details for subscription tax invoices (legal name EN/AR, VAT number, CR, address): fill in `src/config/seller.ts`.
