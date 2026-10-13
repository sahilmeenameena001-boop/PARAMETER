# SCL Brand Transformation Module

Production-ready drop-in module for a **Next.js 14/15 App Router + TypeScript + Tailwind + Supabase + n8n** dashboard.

It implements:

- Multi-tenant client workspaces
- Structured brand audits and weighted scoring
- Audit findings with observations, issues, recommendations and status
- Approved brand-system tokens
- One-click conversion of recommendations into tasks
- Prompt generation using approved brand rules
- AI extraction endpoint that creates versioned audits from pasted reports
- Seed data for **The Page** audit
- Optional n8n hooks for audit extraction and prompt enhancement

## 1. Install packages

```bash
npm install @supabase/supabase-js zod lucide-react
```

## 2. Copy files

Copy the contents of this bundle into the same relative paths in your dashboard.

If your project uses `src/app`, place `app/*` inside `src/app`, and place `components`, `lib`, and `types` inside `src/`.

## 3. Environment variables

Copy `.env.example` values into `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
N8N_AUDIT_WEBHOOK_URL=
N8N_PROMPT_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`.

## 4. Database

Run `supabase/migrations/20260910_brand_transformation.sql` in Supabase SQL Editor.

The migration creates the schema, indexes, triggers, RLS policies and seed function. To load The Page demo:

```sql
select public.seed_the_page_brand_audit(
  'YOUR_ORGANIZATION_UUID'::uuid,
  auth.uid()
);
```

It returns the new client UUID.

To turn a new written audit into structured findings, POST `{ "sourceText": "..." }` to:

```text
/api/brand-transformation/clients/CLIENT_UUID/audits
```

## 5. Open the dashboard

Visit:

```text
/dashboard/brand-transformation/CLIENT_UUID
```

## 6. n8n

Import both files under `n8n/`. Configure `N8N_WEBHOOK_SECRET`, `OPENAI_API_KEY`, and `OPENAI_MODEL` as n8n environment variables. The workflows make live API calls and require no additional AI nodes.

## Existing authentication

The supplied API uses the service-role client because auth implementations vary. Before production, replace `requireUser()` in `lib/brand-transformation/auth.ts` with your existing server-side session helper. Until then, requests require `x-user-id` and `x-organization-id` headers. The included page reads them from `NEXT_PUBLIC_DEMO_USER_ID` and `NEXT_PUBLIC_DEMO_ORGANIZATION_ID` only for local integration.

In production, never trust organization IDs supplied by a browser. Resolve organization membership from your authenticated server session.

## Required integration change

Update `lib/brand-transformation/auth.ts` to connect to your existing auth. Everything else is complete.

## Standalone local testing

This folder now includes a minimal Next.js app shell.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The home page lists the setup steps. Live client dashboards require `.env.local`, the supplied database migration, and a seeded client ID as described above. Restart the dev server after changing environment variables, then visit `/dashboard/brand-transformation/CLIENT_UUID`.

Run `npm run typecheck` to check TypeScript.

## Interactive demo dashboard

Open `http://localhost:3000` to test with sample data; no credentials are required.

- Overview: inspect live scores and create tasks from recommendations.
- Audit findings: search/filter, adjust scores, accept or resolve findings, and create tasks.
- Execution board: add tasks and move them between backlog, to do, in progress, review, and done.
- Brand system: edit colour, typography, and photography rules and change approval status.
- Prompt studio: generate and copy a local template using approved brand rules.
- Export downloads the workspace as JSON. Reset demo restores the sample workspace.

Demo changes persist in this browser's local storage. This is a simulated workspace: it does not write to Supabase or call an AI service. The existing `/dashboard/brand-transformation/CLIENT_UUID` route remains the live integration route.

## Professional Authority Intelligence module

Evidence-backed professional profiles, litigation intelligence, publications and a content workflow with a mandatory legal-review gate. Open `http://localhost:3000/dashboard/professional-intelligence` (local workspace — click **New research** to profile any professional; an Amish Tandon example can be loaded from the empty state or via Reset).

Database: `supabase/migrations/20261012_professional_intelligence.sql` (additive, `pi_` tables). Run `npm test` for the domain tests. Full documentation: `docs/PROFESSIONAL_INTELLIGENCE.md`.

## API keys (encrypted in the repo)

Keys are stored encrypted in `secrets/env.enc`. After cloning: `npm install`, then `npm run unlock` (enter the team password — ask the project owner), then `npm run build && npm start`. To change a key: update it in the app's **Settings** (or `.env.local`), run `npm run secrets:lock`, commit `secrets/env.enc`. Details: `secrets/README.md`.
