# NeaLabs Manpower

Subscription business software for manpower supply, contracting and supply companies in Saudi Arabia.
English and Arabic (RTL), multi-company, 7-day free trial.

**Status:** steps 1 to 3 of 7 done: auth with SMS phone verification, organizations, roles, trial and read-only mode; clients, sites and workforce with Excel import; quotations, proforma and tax invoices with ZATCA Phase 1 QR.

## What works now
- Sign up with email and Saudi mobile, 6-digit SMS code to verify the phone, sign in, sign out, forgot/reset password (rate limited).
- One 7-day free trial per new email + phone number; reused numbers or emails get no new trial.
- 3-step setup wizard: company name → CR, VAT, address → logo and bank details.
- Several companies per user, company switcher, each with its own 7-day trial.
- Team: invite by email as Owner or Accountant, accept invitation, remove member.
- Trial banner with days left; after expiry the company is read-only, with data export always available.
- English/Arabic switch with full RTL layout.
- Clients, sites (each linked to a client) and workforce: add, edit, search, filter, archive/restore, export to Excel.
- Excel import for clients, sites and workers: download template, upload, preview with row-level errors, import the valid rows.
- Iqama and passport numbers encrypted in the database, masked in lists, full number shown only on request (logged).
- Sales: quotation → proforma → tax invoice with one-click conversion; line items with decimal quantities, discount (percent or amount), VAT 15%, live totals.
- Tax invoices are drafts until issued; issuing gives the next number (INV-00001…, no gaps), the exact time and the ZATCA Phase 1 QR code, then locks the invoice.
- Credit notes to correct or cancel an issued invoice (partly or fully): own CN- series, reason, QR, EN/AR print and PDF; the invoice balance goes down, never below zero credit room.
- Payments on issued invoices (partial or full, never more than the balance); status draft / sent / partly paid / paid / overdue; "to collect" totals on the invoice list and dashboard.
- Print view and server-side PDF in English or Arabic (RTL) with bilingual labels, company logo, bank details and QR.
- Iqama/passport expiry: badges in the list, "expiring in 30 days" filter, dashboard card, daily reminder email (30, 14, 7, 1 days before and on the day).

## Local setup

Requirements: Node.js 20.18+ (22 recommended), PostgreSQL 16.

```bash
npm install
cp .env.example .env               # then edit DATABASE_URL
npx prisma migrate deploy          # create tables and RLS policies
npm run db:seed                    # optional demo data
npm run dev                        # http://localhost:3000
```

Demo logins after seeding: `owner@demo.test` / `demo12345` (Owner) and `accountant@demo.test` / `demo12345` (Accountant).

In development, emails (reset links, invitations) and SMS codes are printed in the terminal (`EMAIL_TRANSPORT=console`, `SMS_TRANSPORT=console`).

### Database role (important)

Row Level Security does not apply to superusers. Create a normal role for the app:

```sql
CREATE ROLE nealabs LOGIN PASSWORD 'choose-a-password' CREATEDB;  -- CREATEDB only needed for `prisma migrate dev`
CREATE DATABASE nealabs OWNER nealabs;
```

The app logs `[security] ... Row Level Security is NOT enforced` at startup if the role is wrong.

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (normal role, not superuser) |
| `APP_URL` | yes | Public URL, used in email links, e.g. `https://app.example.com` |
| `EMAIL_TRANSPORT` | yes | `smtp` in production, `console` for local development |
| `EMAIL_FROM` | yes | Sender, e.g. `Company <no-reply@example.com>` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | with smtp | SMTP server credentials |
| `SMS_TRANSPORT` | yes | `unifonic` or `twilio` in production, `console` for local development |
| `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID` | with unifonic | Unifonic app ID and registered sender name |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | with twilio | Twilio credentials; `TWILIO_FROM` is a number or Messaging Service SID |
| `TRIAL_DAYS` | no | Free trial length, default `7` |
| `FIELD_ENCRYPTION_KEY` | yes | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts Iqama and passport numbers. Back it up separately from the database and never change it once real data exists. |
| `CRON_SECRET` | for reminders | Bearer token for `/api/cron/expiry-reminders` (`openssl rand -hex 32`) |
| `PDF_CHROMIUM_PATH` | no | Chromium binary for invoice PDFs. Empty = Playwright's Chromium (`npx playwright-core install chromium`). The Docker image installs it. |

## Tests

```bash
cp .env.example .env.test   # point DATABASE_URL at a separate database whose name contains "test"
DATABASE_URL=<test url> npx prisma migrate deploy
npm test
```

Covers: tenant isolation (RLS, service layer and cross-company links for clients, sites, workers, sales documents, lines, payments and finance entries), VAT and totals, ZATCA QR payload, numbering and conversion under concurrency, payments, income and expenses (automatic income from payments, VAT split, refunds, voiding, site profit report, salary hook), salaries (calculation and rounding, timesheet upload with row errors, one sheet per worker per month, approve → site-wise expenses, reopen, payroll rules, salary sheet and payslip exports with masked Iqama), Iqama encryption and masking, Excel import/export, trial expiry and read-only mode, phone verification and one trial per email + phone, billing cycle pricing, auth (hashing, sessions, reset, rate limit), validators and upload checks.

Other checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Deploy: Vercel + Neon (demo and testing only)

Do not put real worker data (Iqama, passport) on this setup; production data belongs in-region.

1. Create a Neon project. Use the default (non-superuser) role connection string as `DATABASE_URL` (pooled connection is fine).
2. Run migrations once from your machine: `DATABASE_URL=<neon url> npx prisma migrate deploy` (and `npm run db:seed` for demo data).
3. Import the repository in Vercel, set the environment variables above, deploy. The build runs `prisma generate && next build`.
4. PDF download needs a Chromium build for serverless (for example `@sparticuz/chromium`), which is not set up yet. Until then the PDF button answers "not available" and the print view's **Print → Save as PDF** gives the same document.

## Deploy: VPS with Docker (production)

On a server in Saudi Arabia or the Gulf (for PDPL):

```bash
git clone <repo> /opt/nealabs && cd /opt/nealabs
cp .env.example .env
# edit .env: DATABASE_URL=postgresql://nealabs:<password>@db:5432/nealabs, APP_URL, SMTP settings
# edit docker/postgres-init.sql: set the same password (runs only when the volume is first created)
export POSTGRES_ADMIN_PASSWORD=<strong password>
docker compose up -d db
docker compose run --rm migrate      # apply migrations
docker compose up -d app
```

Put a reverse proxy with HTTPS in front of `127.0.0.1:3000` (for example Caddy: `app.example.com { reverse_proxy 127.0.0.1:3000 }`).

Update: `git pull && docker compose build && docker compose run --rm migrate && docker compose up -d app`.

## Backups and restore

Daily backup with `scripts/backup.sh` (pg_dump custom format, archive verified, old files pruned after 14 days, optional off-server copy with rclone):

```bash
# crontab -e on the server (needs postgresql-client 16 and, for off-server copies, rclone)
15 2 * * * cd /opt/nealabs && DATABASE_URL=postgresql://nealabs:<pw>@127.0.0.1:5432/nealabs BACKUP_DIR=/opt/backups BACKUP_REMOTE=offsite:nealabs scripts/backup.sh >> /var/log/nealabs-backup.log 2>&1
```

(To reach the database from the host, add `ports: ["127.0.0.1:5432:5432"]` to the `db` service.)

Restore into an empty database:

```bash
createdb -O nealabs nealabs_restore
DATABASE_URL=postgresql://nealabs:<pw>@127.0.0.1:5432/nealabs_restore scripts/restore.sh /opt/backups/nealabs-<timestamp>.dump
```

Then point `DATABASE_URL` at the restored database (or rename it) and restart the app. Test a restore at least once a month.

## Daily reminder job

`GET /api/cron/expiry-reminders` with `Authorization: Bearer $CRON_SECRET` emails Iqama/passport expiry reminders. Safe to call more than once a day (one email per company per day).

- Vercel: `vercel.json` already schedules it daily at 05:00 UTC (08:00 Riyadh); set `CRON_SECRET` in the project.
- VPS: `0 5 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://app.example.com/api/cron/expiry-reminders`

## Monitoring

Planned before production launch: an uptime check on `APP_URL` and error tracking (for example a self-hosted GlitchTip/Sentry-compatible endpoint). Not wired yet.

## Project structure

```
src/
  config/        brand.ts (names, colors, contacts), plans.ts (prices)
  features/      auth, organizations, billing, audit, clients, sites, workforce, import, master-data, payroll
  components/    ui primitives and layout
  lib/           db (tenantDb / systemDb), env, errors, rate limit, email, validators
  i18n/, messages/  next-intl config, en.json and ar.json
  app/           routes
prisma/          schema, migrations (with RLS policies), seed
tests/           vitest tests against a real PostgreSQL database
```

See `DECISIONS.md` for the reasoning behind these choices.
